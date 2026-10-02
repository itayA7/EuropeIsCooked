export type CountryStatus = 'stable' | 'tense' | 'conflict';

export type Country = {
    code: string;
    name: string;
    status: CountryStatus;
    capital: string;
    nato: boolean;
    eu: boolean;
    activePersonnel: number;
    reservePersonnel: number | null;
    militaryBudgetUsdBillions: number | null;
    leaderName: string;
    leaderTitle: string;
};

export const COUNTRIES: Country[] = [
    { code: 'AL', name: 'Albania', status: 'stable', capital: 'Tirana', nato: true, eu: true, activePersonnel: 7500, reservePersonnel: 0, militaryBudgetUsdBillions: 0.62, leaderName: 'Edi Rama', leaderTitle: 'Prime Minister' },
    { code: 'AT', name: 'Austria', status: 'stable', capital: 'Vienna', nato: false, eu: true, activePersonnel: 22200, reservePersonnel: 109200, militaryBudgetUsdBillions: 6.35, leaderName: 'Christian Stocker', leaderTitle: 'Federal Chancellor' },
    { code: 'BE', name: 'Belgium', status: 'stable', capital: 'Brussels', nato: true, eu: true, activePersonnel: 23500, reservePersonnel: 5900, militaryBudgetUsdBillions: 14.53, leaderName: 'Bart De Wever', leaderTitle: 'Prime Minister' },
    { code: 'BG', name: 'Bulgaria', status: 'stable', capital: 'Sofia', nato: true, eu: true, activePersonnel: 36950, reservePersonnel: 3000, militaryBudgetUsdBillions: 2.59, leaderName: 'Rumen Radev', leaderTitle: 'President' },
    { code: 'CH', name: 'Switzerland', status: 'stable', capital: 'Bern', nato: false, eu: false, activePersonnel: 21300, reservePersonnel: 196450, militaryBudgetUsdBillions: 7.59, leaderName: 'Swiss Federal Council', leaderTitle: 'Collective head of state' },
    { code: 'CY', name: 'Cyprus', status: 'stable', capital: 'Nicosia', nato: false, eu: true, activePersonnel: 12000, reservePersonnel: 60000, militaryBudgetUsdBillions: 0.66, leaderName: 'Nicos Christodoulides', leaderTitle: 'President' },
    { code: 'CZ', name: 'Czechia', status: 'stable', capital: 'Prague', nato: true, eu: true, activePersonnel: 26600, reservePersonnel: 0, militaryBudgetUsdBillions: 7.05, leaderName: 'Andrej Babiš', leaderTitle: 'Prime Minister' },
    { code: 'DE', name: 'Germany', status: 'stable', capital: 'Berlin', nato: true, eu: true, activePersonnel: 179850, reservePersonnel: 34100, militaryBudgetUsdBillions: 113.59, leaderName: 'Friedrich Merz', leaderTitle: 'Federal Chancellor' },
    { code: 'DK', name: 'Denmark', status: 'stable', capital: 'Copenhagen', nato: true, eu: true, activePersonnel: 13100, reservePersonnel: 44200, militaryBudgetUsdBillions: 14.95, leaderName: 'Mette Frederiksen', leaderTitle: 'Prime Minister' },
    { code: 'EE', name: 'Estonia', status: 'tense', capital: 'Tallinn', nato: true, eu: true, activePersonnel: 7100, reservePersonnel: 41200, militaryBudgetUsdBillions: 1.58, leaderName: 'Kristen Michal', leaderTitle: 'Prime Minister' },
    { code: 'ES', name: 'Spain', status: 'stable', capital: 'Madrid', nato: true, eu: true, activePersonnel: 122200, reservePersonnel: 13800, militaryBudgetUsdBillions: 40.21, leaderName: 'Pedro Sánchez', leaderTitle: 'Prime Minister' },
    { code: 'FI', name: 'Finland', status: 'tense', capital: 'Helsinki', nato: true, eu: true, activePersonnel: 23850, reservePersonnel: 233000, militaryBudgetUsdBillions: 8.08, leaderName: 'Petteri Orpo', leaderTitle: 'Prime Minister' },
    { code: 'FR', name: 'France', status: 'stable', capital: 'Paris', nato: true, eu: true, activePersonnel: 203900, reservePersonnel: 38100, militaryBudgetUsdBillions: 68.01, leaderName: 'Sébastien Lecornu', leaderTitle: 'Prime Minister' },
    { code: 'GB', name: 'United Kingdom', status: 'stable', capital: 'London', nato: true, eu: false, activePersonnel: 141100, reservePersonnel: 70450, militaryBudgetUsdBillions: 88.98, leaderName: 'Andy Burnham', leaderTitle: 'Prime Minister' },
    { code: 'GR', name: 'Greece', status: 'tense', capital: 'Athens', nato: true, eu: true, activePersonnel: 131650, reservePersonnel: 264500, militaryBudgetUsdBillions: 8.39, leaderName: 'Kyriakos Mitsotakis', leaderTitle: 'Prime Minister' },
    { code: 'HR', name: 'Croatia', status: 'stable', capital: 'Zagreb', nato: true, eu: true, activePersonnel: 16800, reservePersonnel: 2100, militaryBudgetUsdBillions: 2.10, leaderName: 'Andrej Plenković', leaderTitle: 'Prime Minister' },
    { code: 'HU', name: 'Hungary', status: 'stable', capital: 'Budapest', nato: true, eu: true, activePersonnel: 32150, reservePersonnel: 20000, militaryBudgetUsdBillions: 5.00, leaderName: 'Péter Magyar', leaderTitle: 'Prime Minister' },
    { code: 'IE', name: 'Ireland', status: 'stable', capital: 'Dublin', nato: false, eu: true, activePersonnel: 9500, reservePersonnel: 4050, militaryBudgetUsdBillions: 1.55, leaderName: 'Micheál Martin', leaderTitle: 'Taoiseach' },
    { code: 'IS', name: 'Iceland', status: 'stable', capital: 'Reykjavik', nato: true, eu: false, activePersonnel: 0, reservePersonnel: null, militaryBudgetUsdBillions: 0, leaderName: 'Kristrún Mjöll Frostadóttir', leaderTitle: 'Prime Minister' },
    { code: 'IT', name: 'Italy', status: 'stable', capital: 'Rome', nato: true, eu: true, activePersonnel: 160400, reservePersonnel: 14500, militaryBudgetUsdBillions: 48.14, leaderName: 'Giorgia Meloni', leaderTitle: 'Prime Minister' },
    { code: 'LT', name: 'Lithuania', status: 'tense', capital: 'Vilnius', nato: true, eu: true, activePersonnel: 16100, reservePersonnel: 12950, militaryBudgetUsdBillions: 2.95, leaderName: 'Mindaugas Sinkevičius', leaderTitle: 'Prime Minister' },
    { code: 'LU', name: 'Luxembourg', status: 'stable', capital: 'Luxembourg', nato: true, eu: true, activePersonnel: 1100, reservePersonnel: 0, militaryBudgetUsdBillions: 0.86, leaderName: 'Luc Frieden', leaderTitle: 'Prime Minister' },
    { code: 'LV', name: 'Latvia', status: 'tense', capital: 'Riga', nato: true, eu: true, activePersonnel: 6600, reservePersonnel: 16000, militaryBudgetUsdBillions: 1.73, leaderName: 'Evika Siliņa', leaderTitle: 'Prime Minister' },
    { code: 'MD', name: 'Moldova', status: 'tense', capital: 'Chisinau', nato: false, eu: false, activePersonnel: 5150, reservePersonnel: 58000, militaryBudgetUsdBillions: 0.11, leaderName: 'Maia Sandu', leaderTitle: 'President' },
    { code: 'ME', name: 'Montenegro', status: 'stable', capital: 'Podgorica', nato: true, eu: false, activePersonnel: 2885, reservePersonnel: 2800, militaryBudgetUsdBillions: 0.18, leaderName: 'Milojko Spajić', leaderTitle: 'Prime Minister' },
    { code: 'MK', name: 'North Macedonia', status: 'stable', capital: 'Skopje', nato: true, eu: false, activePersonnel: 8000, reservePersonnel: 4850, militaryBudgetUsdBillions: 0.37, leaderName: 'Hristijan Mickoski', leaderTitle: 'Prime Minister' },
    { code: 'NL', name: 'Netherlands', status: 'stable', capital: 'Amsterdam', nato: true, eu: true, activePersonnel: 33650, reservePersonnel: 6350, militaryBudgetUsdBillions: 28.94, leaderName: 'Rob Jetten', leaderTitle: 'Prime Minister' },
    { code: 'NO', name: 'Norway', status: 'tense', capital: 'Oslo', nato: true, eu: false, activePersonnel: 25400, reservePersonnel: 40000, militaryBudgetUsdBillions: 17.03, leaderName: 'Jonas Gahr Støre', leaderTitle: 'Prime Minister' },
    { code: 'PL', name: 'Poland', status: 'tense', capital: 'Warsaw', nato: true, eu: true, activePersonnel: 173000, reservePersonnel: 37500, militaryBudgetUsdBillions: 46.76, leaderName: 'Donald Tusk', leaderTitle: 'Prime Minister' },
    { code: 'PT', name: 'Portugal', status: 'stable', capital: 'Lisbon', nato: true, eu: true, activePersonnel: 26050, reservePersonnel: 23500, militaryBudgetUsdBillions: 5.86, leaderName: 'Luís Montenegro', leaderTitle: 'Prime Minister' },
    { code: 'RO', name: 'Romania', status: 'tense', capital: 'Bucharest', nato: true, eu: true, activePersonnel: 69900, reservePersonnel: 55000, militaryBudgetUsdBillions: 9.73, leaderName: 'Ilie Bolojan', leaderTitle: 'Prime Minister' },
    { code: 'RS', name: 'Serbia', status: 'tense', capital: 'Belgrade', nato: false, eu: false, activePersonnel: 28150, reservePersonnel: 50150, militaryBudgetUsdBillions: 2.78, leaderName: 'Aleksandar Vučić', leaderTitle: 'President' },
    { code: 'SE', name: 'Sweden', status: 'tense', capital: 'Stockholm', nato: true, eu: true, activePersonnel: 14850, reservePersonnel: 21500, militaryBudgetUsdBillions: 16.47, leaderName: 'Ulf Kristersson', leaderTitle: 'Caretaker Prime Minister' },
    { code: 'SI', name: 'Slovenia', status: 'stable', capital: 'Ljubljana', nato: true, eu: true, activePersonnel: 6200, reservePersonnel: 950, militaryBudgetUsdBillions: 1.22, leaderName: 'Janez Janša', leaderTitle: 'Prime Minister' },
    { code: 'SK', name: 'Slovakia', status: 'stable', capital: 'Bratislava', nato: true, eu: true, activePersonnel: 15850, reservePersonnel: 0, militaryBudgetUsdBillions: 3.12, leaderName: 'Robert Fico', leaderTitle: 'Prime Minister' },
    { code: 'UA', name: 'Ukraine', status: 'conflict', capital: 'Kyiv', nato: false, eu: false, activePersonnel: 677000, reservePersonnel: 0, militaryBudgetUsdBillions: 84.11, leaderName: 'Volodymyr Zelenskyy', leaderTitle: 'President' },
    { code: 'BA', name: 'Bosnia and Herzegovina', status: 'stable', capital: 'Sarajevo', nato: false, eu: false, activePersonnel: 10650, reservePersonnel: 6000, militaryBudgetUsdBillions: 0.23, leaderName: 'Borjana Krišto', leaderTitle: 'Chairwoman of the Council of Ministers' },
    { code: 'BY', name: 'Belarus', status: 'tense', capital: 'Minsk', nato: false, eu: false, activePersonnel: 48600, reservePersonnel: 289500, militaryBudgetUsdBillions: 1.94, leaderName: 'Alexander Turchyn', leaderTitle: 'Prime Minister' },
    { code: 'RU', name: 'Russia', status: 'conflict', capital: 'Moscow', nato: false, eu: false, activePersonnel: 1264000, reservePersonnel: 1500000, militaryBudgetUsdBillions: 190.42, leaderName: 'Vladimir Putin', leaderTitle: 'President' },
    { code: 'TR', name: 'Türkiye', status: 'tense', capital: 'Ankara', nato: true, eu: false, activePersonnel: 355200, reservePersonnel: 378700, militaryBudgetUsdBillions: null, leaderName: 'Recep Tayyip Erdoğan', leaderTitle: 'President' },
];

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map(country => [country.code, country])) as Record<string, Country>;

export const STATIC_DATA_AS_OF = '2026-09-26';
export const MILITARY_BUDGET_YEAR = 2025;
