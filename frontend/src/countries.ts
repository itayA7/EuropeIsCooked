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
    capitalCoords: [number, number];
};

export const COUNTRIES: Country[] = [
    { code: 'AL', name: 'Albania', status: 'stable', capital: 'Tirana', nato: true, eu: false, activePersonnel: 7500, reservePersonnel: 0, militaryBudgetUsdBillions: 0.62, leaderName: 'Edi Rama', capitalCoords: [19.82, 41.33], leaderTitle: 'Prime Minister' },
    { code: 'AT', name: 'Austria', status: 'stable', capital: 'Vienna', nato: false, eu: true, activePersonnel: 22200, reservePersonnel: 109200, militaryBudgetUsdBillions: 6.35, leaderName: 'Christian Stocker', capitalCoords: [16.37, 48.21], leaderTitle: 'Federal Chancellor' },
    { code: 'BE', name: 'Belgium', status: 'stable', capital: 'Brussels', nato: true, eu: true, activePersonnel: 23500, reservePersonnel: 5900, militaryBudgetUsdBillions: 14.53, leaderName: 'Bart De Wever', capitalCoords: [4.35, 50.85], leaderTitle: 'Prime Minister' },
    { code: 'BG', name: 'Bulgaria', status: 'stable', capital: 'Sofia', nato: true, eu: true, activePersonnel: 36950, reservePersonnel: 3000, militaryBudgetUsdBillions: 2.59, leaderName: 'Rumen Radev', capitalCoords: [23.32, 42.7], leaderTitle: 'President' },
    { code: 'CH', name: 'Switzerland', status: 'stable', capital: 'Bern', nato: false, eu: false, activePersonnel: 21300, reservePersonnel: 196450, militaryBudgetUsdBillions: 7.59, leaderName: 'Swiss Federal Council', capitalCoords: [7.45, 46.95], leaderTitle: 'Collective head of state' },
    { code: 'CY', name: 'Cyprus', status: 'stable', capital: 'Nicosia', nato: false, eu: true, activePersonnel: 12000, reservePersonnel: 60000, militaryBudgetUsdBillions: 0.66, leaderName: 'Nicos Christodoulides', capitalCoords: [33.36, 35.17], leaderTitle: 'President' },
    { code: 'CZ', name: 'Czechia', status: 'stable', capital: 'Prague', nato: true, eu: true, activePersonnel: 26600, reservePersonnel: 0, militaryBudgetUsdBillions: 7.05, leaderName: 'Andrej Babiš', capitalCoords: [14.42, 50.08], leaderTitle: 'Prime Minister' },
    { code: 'DE', name: 'Germany', status: 'stable', capital: 'Berlin', nato: true, eu: true, activePersonnel: 179850, reservePersonnel: 34100, militaryBudgetUsdBillions: 113.59, leaderName: 'Friedrich Merz', capitalCoords: [13.4, 52.52], leaderTitle: 'Federal Chancellor' },
    { code: 'DK', name: 'Denmark', status: 'stable', capital: 'Copenhagen', nato: true, eu: true, activePersonnel: 13100, reservePersonnel: 44200, militaryBudgetUsdBillions: 14.95, leaderName: 'Mette Frederiksen', capitalCoords: [12.57, 55.68], leaderTitle: 'Prime Minister' },
    { code: 'EE', name: 'Estonia', status: 'tense', capital: 'Tallinn', nato: true, eu: true, activePersonnel: 7100, reservePersonnel: 41200, militaryBudgetUsdBillions: 1.58, leaderName: 'Kristen Michal', capitalCoords: [24.75, 59.44], leaderTitle: 'Prime Minister' },
    { code: 'ES', name: 'Spain', status: 'stable', capital: 'Madrid', nato: true, eu: true, activePersonnel: 122200, reservePersonnel: 13800, militaryBudgetUsdBillions: 40.21, leaderName: 'Pedro Sánchez', capitalCoords: [-3.7, 40.42], leaderTitle: 'Prime Minister' },
    { code: 'FI', name: 'Finland', status: 'tense', capital: 'Helsinki', nato: true, eu: true, activePersonnel: 23850, reservePersonnel: 233000, militaryBudgetUsdBillions: 8.08, leaderName: 'Petteri Orpo', capitalCoords: [24.94, 60.17], leaderTitle: 'Prime Minister' },
    { code: 'FR', name: 'France', status: 'stable', capital: 'Paris', nato: true, eu: true, activePersonnel: 203900, reservePersonnel: 38100, militaryBudgetUsdBillions: 68.01, leaderName: 'Sébastien Lecornu', capitalCoords: [2.35, 48.86], leaderTitle: 'Prime Minister' },
    { code: 'GB', name: 'United Kingdom', status: 'stable', capital: 'London', nato: true, eu: false, activePersonnel: 141100, reservePersonnel: 70450, militaryBudgetUsdBillions: 88.98, leaderName: 'Andy Burnham', capitalCoords: [-0.13, 51.51], leaderTitle: 'Prime Minister' },
    { code: 'GR', name: 'Greece', status: 'tense', capital: 'Athens', nato: true, eu: true, activePersonnel: 131650, reservePersonnel: 264500, militaryBudgetUsdBillions: 8.39, leaderName: 'Kyriakos Mitsotakis', capitalCoords: [23.73, 37.98], leaderTitle: 'Prime Minister' },
    { code: 'HR', name: 'Croatia', status: 'stable', capital: 'Zagreb', nato: true, eu: true, activePersonnel: 16800, reservePersonnel: 2100, militaryBudgetUsdBillions: 2.10, leaderName: 'Andrej Plenković', capitalCoords: [15.98, 45.81], leaderTitle: 'Prime Minister' },
    { code: 'HU', name: 'Hungary', status: 'stable', capital: 'Budapest', nato: true, eu: true, activePersonnel: 32150, reservePersonnel: 20000, militaryBudgetUsdBillions: 5.00, leaderName: 'Péter Magyar', capitalCoords: [19.04, 47.5], leaderTitle: 'Prime Minister' },
    { code: 'IE', name: 'Ireland', status: 'stable', capital: 'Dublin', nato: false, eu: true, activePersonnel: 9500, reservePersonnel: 4050, militaryBudgetUsdBillions: 1.55, leaderName: 'Micheál Martin', capitalCoords: [-6.26, 53.35], leaderTitle: 'Taoiseach' },
    { code: 'IS', name: 'Iceland', status: 'stable', capital: 'Reykjavik', nato: true, eu: false, activePersonnel: 0, reservePersonnel: null, militaryBudgetUsdBillions: 0, leaderName: 'Kristrún Mjöll Frostadóttir', capitalCoords: [-21.94, 64.15], leaderTitle: 'Prime Minister' },
    { code: 'IT', name: 'Italy', status: 'stable', capital: 'Rome', nato: true, eu: true, activePersonnel: 160400, reservePersonnel: 14500, militaryBudgetUsdBillions: 48.14, leaderName: 'Giorgia Meloni', capitalCoords: [12.5, 41.9], leaderTitle: 'Prime Minister' },
    { code: 'LT', name: 'Lithuania', status: 'tense', capital: 'Vilnius', nato: true, eu: true, activePersonnel: 16100, reservePersonnel: 12950, militaryBudgetUsdBillions: 2.95, leaderName: 'Mindaugas Sinkevičius', capitalCoords: [25.28, 54.69], leaderTitle: 'Prime Minister' },
    { code: 'LU', name: 'Luxembourg', status: 'stable', capital: 'Luxembourg', nato: true, eu: true, activePersonnel: 1100, reservePersonnel: 0, militaryBudgetUsdBillions: 0.86, leaderName: 'Luc Frieden', capitalCoords: [6.13, 49.61], leaderTitle: 'Prime Minister' },
    { code: 'LV', name: 'Latvia', status: 'tense', capital: 'Riga', nato: true, eu: true, activePersonnel: 6600, reservePersonnel: 16000, militaryBudgetUsdBillions: 1.73, leaderName: 'Evika Siliņa', capitalCoords: [24.11, 56.95], leaderTitle: 'Prime Minister' },
    { code: 'MD', name: 'Moldova', status: 'tense', capital: 'Chisinau', nato: false, eu: false, activePersonnel: 5150, reservePersonnel: 58000, militaryBudgetUsdBillions: 0.11, leaderName: 'Maia Sandu', capitalCoords: [28.86, 47.01], leaderTitle: 'President' },
    { code: 'ME', name: 'Montenegro', status: 'stable', capital: 'Podgorica', nato: true, eu: false, activePersonnel: 2885, reservePersonnel: 2800, militaryBudgetUsdBillions: 0.18, leaderName: 'Milojko Spajić', capitalCoords: [19.26, 42.44], leaderTitle: 'Prime Minister' },
    { code: 'MK', name: 'North Macedonia', status: 'stable', capital: 'Skopje', nato: true, eu: false, activePersonnel: 8000, reservePersonnel: 4850, militaryBudgetUsdBillions: 0.37, leaderName: 'Hristijan Mickoski', capitalCoords: [21.43, 42.0], leaderTitle: 'Prime Minister' },
    { code: 'NL', name: 'Netherlands', status: 'stable', capital: 'Amsterdam', nato: true, eu: true, activePersonnel: 33650, reservePersonnel: 6350, militaryBudgetUsdBillions: 28.94, leaderName: 'Rob Jetten', capitalCoords: [4.9, 52.37], leaderTitle: 'Prime Minister' },
    { code: 'NO', name: 'Norway', status: 'tense', capital: 'Oslo', nato: true, eu: false, activePersonnel: 25400, reservePersonnel: 40000, militaryBudgetUsdBillions: 17.03, leaderName: 'Jonas Gahr Støre', capitalCoords: [10.75, 59.91], leaderTitle: 'Prime Minister' },
    { code: 'PL', name: 'Poland', status: 'tense', capital: 'Warsaw', nato: true, eu: true, activePersonnel: 173000, reservePersonnel: 37500, militaryBudgetUsdBillions: 46.76, leaderName: 'Donald Tusk', capitalCoords: [21.01, 52.23], leaderTitle: 'Prime Minister' },
    { code: 'PT', name: 'Portugal', status: 'stable', capital: 'Lisbon', nato: true, eu: true, activePersonnel: 26050, reservePersonnel: 23500, militaryBudgetUsdBillions: 5.86, leaderName: 'Luís Montenegro', capitalCoords: [-9.14, 38.72], leaderTitle: 'Prime Minister' },
    { code: 'RO', name: 'Romania', status: 'tense', capital: 'Bucharest', nato: true, eu: true, activePersonnel: 69900, reservePersonnel: 55000, militaryBudgetUsdBillions: 9.73, leaderName: 'Ilie Bolojan', capitalCoords: [26.1, 44.43], leaderTitle: 'Prime Minister' },
    { code: 'RS', name: 'Serbia', status: 'tense', capital: 'Belgrade', nato: false, eu: false, activePersonnel: 28150, reservePersonnel: 50150, militaryBudgetUsdBillions: 2.78, leaderName: 'Aleksandar Vučić', capitalCoords: [20.46, 44.79], leaderTitle: 'President' },
    { code: 'SE', name: 'Sweden', status: 'tense', capital: 'Stockholm', nato: true, eu: true, activePersonnel: 14850, reservePersonnel: 21500, militaryBudgetUsdBillions: 16.47, leaderName: 'Ulf Kristersson', capitalCoords: [18.07, 59.33], leaderTitle: 'Caretaker Prime Minister' },
    { code: 'SI', name: 'Slovenia', status: 'stable', capital: 'Ljubljana', nato: true, eu: true, activePersonnel: 6200, reservePersonnel: 950, militaryBudgetUsdBillions: 1.22, leaderName: 'Janez Janša', capitalCoords: [14.51, 46.06], leaderTitle: 'Prime Minister' },
    { code: 'SK', name: 'Slovakia', status: 'stable', capital: 'Bratislava', nato: true, eu: true, activePersonnel: 15850, reservePersonnel: 0, militaryBudgetUsdBillions: 3.12, leaderName: 'Robert Fico', capitalCoords: [17.11, 48.15], leaderTitle: 'Prime Minister' },
    { code: 'UA', name: 'Ukraine', status: 'conflict', capital: 'Kyiv', nato: false, eu: false, activePersonnel: 677000, reservePersonnel: 0, militaryBudgetUsdBillions: 84.11, leaderName: 'Volodymyr Zelenskyy', capitalCoords: [30.52, 50.45], leaderTitle: 'President' },
    { code: 'BA', name: 'Bosnia and Herzegovina', status: 'stable', capital: 'Sarajevo', nato: false, eu: false, activePersonnel: 10650, reservePersonnel: 6000, militaryBudgetUsdBillions: 0.23, leaderName: 'Borjana Krišto', capitalCoords: [18.41, 43.86], leaderTitle: 'Chairwoman of the Council of Ministers' },
    { code: 'BY', name: 'Belarus', status: 'tense', capital: 'Minsk', nato: false, eu: false, activePersonnel: 48600, reservePersonnel: 289500, militaryBudgetUsdBillions: 1.94, leaderName: 'Alexander Turchyn', capitalCoords: [27.56, 53.9], leaderTitle: 'Prime Minister' },
    { code: 'RU', name: 'Russia', status: 'conflict', capital: 'Moscow', nato: false, eu: false, activePersonnel: 1264000, reservePersonnel: 1500000, militaryBudgetUsdBillions: 190.42, leaderName: 'Vladimir Putin', capitalCoords: [37.62, 55.76], leaderTitle: 'President' },
    { code: 'TR', name: 'Türkiye', status: 'tense', capital: 'Ankara', nato: true, eu: false, activePersonnel: 355200, reservePersonnel: 378700, militaryBudgetUsdBillions: null, leaderName: 'Recep Tayyip Erdoğan', capitalCoords: [32.85, 39.93], leaderTitle: 'President' },
];

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map(country => [country.code, country])) as Record<string, Country>;

export const STATIC_DATA_AS_OF = '2026-09-26';
export const MILITARY_BUDGET_YEAR = 2025;
