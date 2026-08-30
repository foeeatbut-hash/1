/**
 * Инженерный словарь: вентиляция, теплотехника, оборудование, монтаж.
 *
 * Это не «англо-русский словарь вообще», а именно их предметная область — там,
 * где общий словарь врёт чаще, чем помогает. «Колесо» вентилятора — не `wheel`,
 * «сборка» узла — не `assembly` в смысле собрания, «расход» — не `expense`.
 * Пары взяты в том виде, в каком они стоят в опросных листах и ведомостях,
 * уходящих заказчику.
 *
 * Словарь дополняется из самой программы: подтверждённые пары ВДР и памяти
 * переводов ложатся поверх этого списка и имеют перед ним приоритет.
 */
import { parsePairs } from './parse';

const BLOCK = `
# ── Оборудование и узлы ──
вентиляционная установка | вентустановка | приточная установка = air handling unit
приточно-вытяжная установка = supply and exhaust air handling unit
вытяжная установка = exhaust air handling unit
кондиционер = air conditioner
центральный кондиционер = central air conditioning unit
вентилятор = fan
осевой вентилятор = axial fan
радиальный вентилятор | центробежный вентилятор = centrifugal fan
крышный вентилятор = roof fan
канальный вентилятор = duct fan
дымоудаление = smoke extraction
вентилятор дымоудаления = smoke exhaust fan
рабочее колесо = impeller
лопатка = blade
улитка = scroll casing
корпус = casing
рама = frame
опорная рама = support frame
виброопора = vibration isolator
гибкая вставка = flexible connector
электродвигатель | двигатель = electric motor
привод = drive
ременная передача = belt drive
шкив = pulley
подшипник = bearing
вал = shaft
муфта = coupling
теплообменник = heat exchanger
водяной нагреватель = water heating coil
электрический нагреватель = electric heater
воздухонагреватель = air heater
воздухоохладитель = air cooler
охладитель = cooler
рекуператор = heat recovery unit
роторный рекуператор = rotary heat exchanger
пластинчатый рекуператор = plate heat exchanger
гликолевый контур = glycol circuit
увлажнитель = humidifier
осушитель = dehumidifier
каплеуловитель = droplet eliminator
фильтр = filter
карманный фильтр = bag filter
панельный фильтр = panel filter
угольный фильтр = carbon filter
фильтр тонкой очистки = fine filter
класс фильтрации = filter class
шумоглушитель = silencer
воздушный клапан = air damper
обратный клапан = check valve
регулирующий клапан = control valve
запорный клапан = shut-off valve
огнезадерживающий клапан = fire damper
привод клапана = damper actuator
воздуховод = duct
короб = duct casing
переход = transition piece
отвод = bend
тройник = tee
врезка = branch connection
диффузор = diffuser
решётка = grille
анемостат = ceiling diffuser
зонт = weather hood
дефлектор = deflector
шибер = gate damper
камера смешения = mixing chamber
секция = section
блок = module
насос = pump
насосная станция = pumping unit
компрессор = compressor
холодильная машина | чиллер = chiller
градирня = cooling tower
бак = tank
расширительный бак = expansion tank
теплоизоляция = thermal insulation
антивибрационная вставка = anti-vibration insert
щит управления = control panel
шкаф управления = control cabinet
автоматика = automation
датчик = sensor
датчик температуры = temperature sensor
датчик давления = pressure sensor
датчик влажности = humidity sensor
преобразователь частоты | частотный преобразователь = frequency converter
пускатель = starter
контроллер = controller
термостат = thermostat

# ── Параметры и величины ──
расход = flow rate
расход воздуха = air flow rate
расход воды = water flow rate
производительность = capacity
номинальная производительность = rated capacity
давление = pressure
полное давление = total pressure
статическое давление = static pressure
перепад давления = pressure drop
потеря давления = pressure loss
скорость = velocity
скорость воздуха = air velocity
температура = temperature
температура воздуха = air temperature
температура на входе = inlet temperature
температура на выходе = outlet temperature
влажность = humidity
относительная влажность = relative humidity
мощность = power
тепловая мощность = heating capacity
холодильная мощность = cooling capacity
потребляемая мощность = power consumption
установленная мощность = installed power
номинальный ток = rated current
напряжение = voltage
частота = frequency
частота вращения = rotation speed
уровень шума = noise level
звуковое давление = sound pressure
звуковая мощность = sound power
коэффициент полезного действия | кпд = efficiency
масса = weight
габариты | габаритные размеры = overall dimensions
длина = length
ширина = width
высота = height
диаметр = diameter
условный проход = nominal bore
толщина = thickness
площадь = area
объём = volume
кратность воздухообмена = air change rate
воздухообмен = air exchange
потери напора = head loss

# ── Исполнение, материалы, условия ──
исполнение = design version
климатическое исполнение = climatic version
взрывозащищённое исполнение = explosion-proof design
взрывозащита = explosion protection
степень защиты = ingress protection rating
категория помещения = room category
материал = material
оцинкованная сталь = galvanized steel
нержавеющая сталь = stainless steel
углеродистая сталь = carbon steel
алюминий = aluminium
покрытие = coating
окраска = painting
грунтовка = primer
утеплитель = insulation material
минеральная вата = mineral wool
уплотнение = sealing
прокладка = gasket
крепёж = fasteners
болт = bolt
гайка = nut
шайба = washer
сварка = welding
сварной шов = weld seam
резьба = thread
фланец = flange
патрубок = connection spigot
наружная установка = outdoor installation
внутренняя установка = indoor installation
рабочая среда = working medium
окружающая среда = ambient conditions
температура окружающего воздуха = ambient air temperature
район строительства = construction site region
сейсмичность = seismicity
срок службы = service life
гарантийный срок = warranty period

# ── Работы и состояния ──
монтаж = installation
демонтаж = dismantling
наладка | пусконаладка = commissioning
пусконаладочные работы = commissioning works
испытание = test
приёмочные испытания = acceptance tests
заводские испытания = factory acceptance test
обслуживание = maintenance
техническое обслуживание = maintenance service
ремонт = repair
замена = replacement
осмотр = inspection
поверка = verification
хранение = storage
транспортирование = transportation
упаковка = packing
консервация = preservation
шефмонтаж = installation supervision
обучение персонала = personnel training
ввод в эксплуатацию = putting into operation
эксплуатация = operation
рабочий режим = operating mode
резервный = standby
аварийный = emergency
неисправность = fault
отказ = failure
блокировка = interlock
сигнализация = alarm
диспетчеризация = supervisory control

# ── Системы и помещения ──
система вентиляции = ventilation system
система кондиционирования = air conditioning system
система отопления = heating system
система холодоснабжения = cooling supply system
приточная система = supply air system
вытяжная система = exhaust air system
общеобменная вентиляция = general ventilation
местная вытяжка = local exhaust
противодымная вентиляция = smoke control ventilation
теплоснабжение = heat supply
водоснабжение = water supply
канализация = sewerage
электроснабжение = power supply
заземление = earthing
молниезащита = lightning protection
венткамера = ventilation chamber
машинный зал = machine hall
операторная = control room
насосная = pump station
щитовая = switchgear room
кровля = roof
перекрытие = floor slab
фундамент = foundation
`;

export const ENGINEERING = parsePairs(BLOCK);
