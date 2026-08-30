/**
 * Единицы измерения и сокращения.
 *
 * Отдельно от инженерного словаря, потому что живут по своим правилам: пишутся
 * без точки, не склоняются и стоят вплотную к числу, которое защита уже вынула
 * из строки. Без них ведомость на английском выглядит переведённой наполовину:
 * «air flow rate 12 000 м³/ч».
 */
import { parsePairs } from './parse';

const BLOCK = `
мм = mm
см = cm
м = m
км = km
мм2 = mm2
м2 = m2
м3 = m3
м3/ч = m3/h
л = l
л/с = l/s
г = g
кг = kg
т = t
н = N
па = Pa
кпа = kPa
мпа = MPa
бар = bar
мм вод ст = mm w.g.
вт = W
квт = kW
мвт = MW
втч = Wh
квтч = kWh
в = V
кв = kV
а = A
ма = mA
гц = Hz
об/мин = rpm
дб = dB
дба = dBA
шт = pcs
компл = set
уп = pack
м пог = lin.m
градус = degree
процент = percent
раз в час = per hour
в час = per hour
в сутки = per day
в год = per year
номинальный = nominal
максимальный = maximum
минимальный = minimum
не более = max
не менее = min
приблизительно = approximately
`;

export const UNITS = parsePairs(BLOCK);
