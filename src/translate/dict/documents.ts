/**
 * Словарь документооборота: названия документов, шапки таблиц, ревизии, штампы.
 *
 * Именно эти слова уходят заказчику чаще всего — и именно на них он присылает
 * замечание, если в соседних ревизиях они названы по-разному. Список собран по
 * реальным реестрам ВДР и по типам документов стандарта, поэтому «Опросный
 * лист» здесь `Data Sheet`, а не `Questionnaire`, как перевёл бы общий словарь.
 */
import { parsePairs } from './parse';

const BLOCK = `
# ── Виды документов ──
опросный лист на = data sheet for
опросный лист = data sheet
технический паспорт = technical passport
паспорт изделия = product passport
руководство по эксплуатации = operation manual
инструкция по монтажу = installation instruction
руководство по монтажу и эксплуатации = installation and operation manual
чертёж = drawing
габаритный чертёж = general arrangement drawing
сборочный чертёж = assembly drawing
монтажный чертёж = installation drawing
схема = diagram
принципиальная схема = process flow diagram
структурная схема = block diagram
электрическая схема = wiring diagram
схема автоматизации = instrumentation diagram
спецификация = specification
спецификация оборудования = equipment specification
ведомость = list
ведомость оборудования = equipment list
ведомость материалов = bill of materials
техническое задание = technical assignment
технические требования = technical requirements
технические условия = technical conditions
расчёт = calculation
тепловой расчёт = thermal calculation
аэродинамический расчёт = aerodynamic calculation
акустический расчёт = acoustic calculation
прочностной расчёт = strength calculation
протокол испытаний = test report
программа испытаний = test programme
сертификат = certificate
сертификат соответствия = certificate of conformity
декларация соответствия = declaration of conformity
разрешение = permit
акт = statement
акт приёмки = acceptance statement
график = schedule
график изготовления = fabrication schedule
график поставки = delivery schedule
реестр документации поставщика = vendor document register
перечень = index
перечень документов = document index
пояснительная записка = explanatory note
отчёт = report
заключение = conclusion
письмо = letter
запрос = request
запрос технической информации = request for information
уведомление = notification
замечание = comment
ответ на замечания = comment response sheet
изменение = revision change
извещение об изменении = change notice

# ── Шапка реестра и штамп ──
наименование = title
наименование документа = document title
номер документа = document number
номер подрядчика = contractor document number
номер заказчика = owner document number
номер поставщика = vendor document number
номер заказа = purchase order number
номер проекта = project number
обозначение = designation
шифр = code
тип документа = document type
ревизия = revision
редакция = edition
дата = date
дата выпуска = issue date
причина выпуска = reason for issue
язык = language
количество листов = number of sheets
лист = sheet
листов = sheets
стадия = stage
формат = format
масштаб = scale
разработал = prepared by
проверил = checked by
согласовал = agreed by
утвердил = approved by
нормоконтроль = standards inspection
подпись = signature
должность = position
организация = organisation
заказчик = client
подрядчик = contractor
поставщик = vendor
изготовитель = manufacturer
проектная организация = design institute
объект = facility
проект = project
стройка = construction project
раздел = section
том = volume
приложение = appendix
примечание = note
позиция = item
поз = item
количество = quantity
единица измерения = unit of measure
цена = price
стоимость = cost
итого = total
всего = total
в том числе = including

# ── Оборот документов ──
на рассмотрение = for review
для сведения = for information
для строительства = for construction
утверждено = approved
утверждено с замечаниями = approved with comments
не утверждено = not approved
на доработку = for revision
принято = accepted
отклонено = rejected
выпущено = issued
аннулировано = void
заменено = superseded
черновая ревизия = draft revision
утверждённая ревизия = approved revision
срок рассмотрения = review period
срок предоставления = submission deadline
комплект документации = documentation package
передача документации = documentation transmittal
сопроводительное письмо = transmittal letter
входящий номер = incoming number
исходящий номер = outgoing number
`;

export const DOCUMENTS = parsePairs(BLOCK);
