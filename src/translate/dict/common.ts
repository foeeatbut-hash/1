/**
 * Общие слова: деловая переписка и то, без чего не читается ни одно письмо.
 *
 * Список нарочно небольшой и предметный. Задача не «перевести английский», а
 * дать понять письмо: кто, что просит, к какому сроку и про какой документ.
 * Поэтому здесь глаголы просьбы и сроков, слова времени, связки и вежливость —
 * то, что несёт смысл письма, а не всё подряд.
 *
 * Пары читаются в обе стороны, и первая пара выигрывает при обратном чтении:
 * поэтому «просим = please» стоит раньше, чем «пожалуйста = please».
 */
import { parsePairs } from './parse';

const BLOCK = `
# ── Просьбы и действия ──
просим = please
пожалуйста = kindly
просим предоставить = please provide
просим выслать = please send
просим подтвердить = please confirm
просим рассмотреть = please review
направляем = we are sending
высылаем = we send
сообщаем = we inform
подтверждаем = we confirm
уведомляем = we notify
прилагаем = we attach
во вложении = attached herewith
вложение = attachment
приложено = enclosed
получено = received
отправлено = sent
рассмотрено = reviewed
согласовано = agreed
требуется = required
необходимо = necessary
следует = shall
должен = must
может = may
разрешено = permitted
запрещено = prohibited
предоставить = provide
выслать = send
подтвердить = confirm
проверить = check
рассмотреть = review
согласовать = agree
уточнить = clarify
исправить = correct
дополнить = supplement
заполнить = fill in
приложить = attach
ответить = reply
сообщить = inform
запросить = request
обсудить = discuss
принять = accept
отклонить = reject
отменить = cancel
перенести = postpone
ускорить = expedite

# ── Сроки и время ──
срок = deadline
в срок = on time
до = by
не позднее = no later than
как можно скорее = as soon as possible
срочно = urgently
сегодня = today
завтра = tomorrow
вчера = yesterday
сейчас = now
неделя = week
на этой неделе = this week
на следующей неделе = next week
месяц = month
год = year
день = day
рабочий день = working day
дата = date
время = time
график = schedule
задержка = delay
просрочено = overdue
продление = extension
период = period
этап = stage

# ── Люди и стороны ──
уважаемый = dear
коллеги = colleagues
господин = mister
госпожа = madam
команда = team
отдел = department
компания = company
инженер = engineer
менеджер = manager
руководитель проекта = project manager
специалист = specialist
представитель = representative
контактное лицо = contact person
получатель = recipient
отправитель = sender
копия = copy
с уважением = best regards
заранее благодарим = thank you in advance
спасибо = thank you
благодарим за письмо = thank you for your letter

# ── Связки и оценки ──
вопрос = question
ответ = answer
проблема = issue
решение = solution
причина = reason
результат = result
предложение = proposal
замечания = comments
уточнение = clarification
подтверждение = confirmation
согласие = approval
отказ = refusal
важно = important
срочный = urgent
предварительный = preliminary
окончательный = final
текущий = current
следующий = next
предыдущий = previous
новый = new
старый = old
дополнительный = additional
основной = main
общий = general
частичный = partial
полный = complete
готово = ready
в работе = in progress
не начато = not started
завершено = completed
без изменений = no changes
согласно = according to
относительно = regarding
по поводу = concerning
в соответствии с = in accordance with
на основании = on the basis of
в связи с = due to
кроме того = furthermore
однако = however
поэтому = therefore
если = if
когда = when
после = after
до этого = before
во время = during
между = between
внутри = inside
снаружи = outside
вместе с = together with
вместо = instead of
также = also
только = only
все = all
каждый = each
любой = any
некоторые = some
нет = no
да = yes
`;

export const COMMON = parsePairs(BLOCK);
