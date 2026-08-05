import re, collections, sys

RESERVED = set("""and as boolean byref byte byval call case class const currency debug dim do double
each else elseif empty end endif enum eqv event exit false for function get goto if imp implements in
integer is let like long loop lset me mod new next not nothing null on option optional or paramarray
preserve private public raiseevent redim rem resume rset select set shared single static stop sub then
to true type typeof until variant wend while with xor""".split())

path = sys.argv[1] if len(sys.argv) > 1 else 'E3_Devices_Tool.hta'
raw_bytes = open(path, 'rb').read()
for enc in ('utf-8', 'cp1251'):
    try:
        src = raw_bytes.decode(enc)
        break
    except UnicodeDecodeError:
        continue
else:
    sys.exit('не удалось определить кодировку файла')
code = re.search(r'<script language="VBScript">(.*)</script>', src, re.S).group(1)

# склейка продолжений строк
joined, buf, startn = [], '', 0
for n, l in enumerate(code.split('\n'), 1):
    if not buf:
        startn = n
    s = l.rstrip()
    if s.endswith('_'):
        buf += s[:-1] + ' '
    else:
        joined.append((startn, buf + s)); buf = ''

def strip(l):
    out, ins = '', False
    for ch in l:
        if ch == '"':
            ins = not ins; continue
        if ch == "'" and not ins:
            break
        out += ' ' if ins else ch
    return out

problems = []

# 1. зарезервированные слова как имена переменных и параметров
for n, rl in joined:
    l = strip(rl).strip()
    m = re.match(r'^(?:Sub|Function)\s+(\w+)\s*\((.*)\)\s*$', l, re.I)
    if m:
        if m.group(1).lower() in RESERVED:
            problems.append((n, 'имя процедуры — зарезервированное слово', m.group(1)))
        for p in m.group(2).split(','):
            p = p.strip().replace('ByRef', '').replace('ByVal', '').strip().replace('()', '')
            if p.lower() in RESERVED:
                problems.append((n, 'параметр — зарезервированное слово', p))
    if re.match(r'^Dim\s+', l, re.I):
        for v in l[4:].split(','):
            v = v.strip().replace('()', '')
            if v.lower() in RESERVED:
                problems.append((n, 'переменная — зарезервированное слово', v))

# 2. парность блоков
stack, errors = [], []
for n, rl in joined:
    l = strip(rl).strip(); low = l.lower()
    if not low:
        continue
    if re.match(r'^(sub|function)\s+\w+', low):
        stack.append(('proc', n, low))
    elif low in ('end sub', 'end function'):
        stack.pop() if stack and stack[-1][0] == 'proc' else errors.append((n, 'end proc', l))
    elif re.match(r'^if\b', low) and not re.search(r'\bthen\b\s*\S', low):
        stack.append(('if', n, l))
    elif low == 'end if':
        stack.pop() if stack and stack[-1][0] == 'if' else errors.append((n, 'End If', l))
    elif re.match(r'^for\b|^for each\b', low):
        stack.append(('for', n, l))
    elif re.match(r'^next\b', low):
        stack.pop() if stack and stack[-1][0] == 'for' else errors.append((n, 'Next', l))
    elif re.match(r'^do\b', low):
        stack.append(('do', n, l))
    elif low == 'loop' or low.startswith('loop '):
        stack.pop() if stack and stack[-1][0] == 'do' else errors.append((n, 'Loop', l))
    elif re.match(r'^select case\b', low):
        stack.append(('select', n, l))
    elif low == 'end select':
        stack.pop() if stack and stack[-1][0] == 'select' else errors.append((n, 'End Select', l))
    elif re.match(r'^with\b', low):
        stack.append(('with', n, l))
    elif low == 'end with':
        stack.pop() if stack and stack[-1][0] == 'with' else errors.append((n, 'End With', l))

# 3. дубли Dim в пределах процедуры
cur, seen = None, {}
for n, rl in joined:
    l = strip(rl).strip(); low = l.lower()
    m = re.match(r'^(sub|function)\s+(\w+)', low)
    if m:
        cur = m.group(2); seen[cur] = []
    if low in ('end sub', 'end function'):
        cur = None
    if cur and low.startswith('dim '):
        for v in l[4:].split(','):
            v = v.strip().replace('()', '').lower()
            if v:
                if v in seen[cur]:
                    problems.append((n, 'повторный Dim в ' + cur, v))
                seen[cur].append(v)

# 4. ReDim Preserve не по последней размерности
for n, rl in joined:
    l = strip(rl).strip()
    m = re.match(r'^ReDim\s+Preserve\s+(\w+)\((.*)\)\s*$', l, re.I)
    if m and ',' in m.group(2):
        problems.append((n, 'ReDim Preserve 2D — проверь, что растёт последняя размерность', l.strip()))

# 5. согласованность числа аргументов вызовов процедур
sigs = {}
for n, rl in joined:
    m = re.match(r'^\s*(?:Sub|Function)\s+(\w+)\s*\((.*)\)\s*$', strip(rl).strip(), re.I)
    if m:
        args = [a for a in m.group(2).split(',') if a.strip()]
        sigs[m.group(1).lower()] = len(args)

def toplevel(argstr):
    depth, ins, n = 0, False, 1
    if not argstr.strip():
        return 0
    for ch in argstr:
        if ch == '"':
            ins = not ins
        if ins:
            continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ',' and depth == 0:
            n += 1
    return n

for n, rl in joined:
    l = strip(rl).strip()
    m = re.match(r'^(\w+)\s+(\S.*)$', l)
    if m and m.group(2).lstrip().startswith('='):
        continue          # присваивание возвращаемого значения, не вызов
    if m and m.group(1).lower() in sigs and m.group(1).lower() not in ('sub', 'function', 'dim', 'set', 'if'):
        got = toplevel(m.group(2))
        want = sigs[m.group(1).lower()]
        if got != want:
            problems.append((n, f'вызов {m.group(1)}: аргументов {got}, объявлено {want}', l[:70]))

print('незакрытые блоки:', stack[:5])
print('ошибки парности :', errors[:5])
print('процедур        :', len(sigs))
if problems:
    print('ЗАМЕЧАНИЯ:')
    for p in problems:
        print('  строка', p[0], '-', p[1], ':', p[2])
else:
    print('замечаний нет')
try:
    src.encode('cp1251')
    print('cp1251          : ok')
except UnicodeEncodeError as e:
    print('cp1251          : FAIL', e)
