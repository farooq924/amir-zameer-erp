/**
 * Demo data for TailoringERP: a tailoring shop in Karachi.
 * Everything here is fictional. Names, phone numbers and CNICs are made up for demonstration only.
 */

export const DEMO_SETTING_KEY = 'demo.data';
export const DEMO_NOTE = '[Demo]';

export const DEMO_USER = {
  username: 'demo',
  password: 'Demo@12345',
  fullName: 'Demo User',
  email: 'demo.user@example.com',
  roleCode: 'MANAGER',
} as const;

export interface DemoCustomer {
  name: string;
  mobile: string;
  area: string;
  address: string;
  type: 'WALK_IN' | 'REGULAR' | 'VIP' | 'CORPORATE';
  email?: string;
  openingBalance?: string;
  note?: string;
  /** Body size in inches, used to make believable measurements. */
  size: { chest: number; height: 'S' | 'M' | 'L' };
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: 'Muhammad Asif Siddiqui', mobile: '0300-2145873', area: 'Gulshan-e-Iqbal', address: 'House A-112, Block 13-D, Gulshan-e-Iqbal', type: 'VIP', note: 'Prefers loose fitting. Always wants ban collar.', size: { chest: 42, height: 'M' } },
  { name: 'Syed Kamran Ali', mobile: '0321-8734512', area: 'DHA Phase 6', address: 'Bungalow 34, Khayaban-e-Ittehad, DHA Phase 6', type: 'VIP', email: 'kamran.ali@example.com', size: { chest: 44, height: 'L' } },
  { name: 'Faisal Memon', mobile: '0333-2190456', area: 'Kharadar', address: 'Flat 7, Memon Heights, Kharadar', type: 'REGULAR', size: { chest: 40, height: 'M' } },
  { name: 'Arsalan Qureshi', mobile: '0345-2671938', area: 'North Nazimabad', address: 'House R-45, Block H, North Nazimabad', type: 'REGULAR', size: { chest: 38, height: 'M' } },
  { name: 'Hamza Sheikh', mobile: '0312-2458761', area: 'Clifton', address: 'Apartment 9-B, Sea View Towers, Block 2, Clifton', type: 'REGULAR', size: { chest: 40, height: 'L' } },
  { name: 'Bilal Ahmed Khan', mobile: '0301-2389745', area: 'Nazimabad', address: 'House 3/12, Nazimabad No. 3', type: 'REGULAR', openingBalance: '3500', note: 'Old balance from the register.', size: { chest: 44, height: 'M' } },
  { name: 'Usman Ghani', mobile: '0322-2047319', area: 'Saddar', address: 'Shop 22, Zainab Market, Saddar', type: 'WALK_IN', size: { chest: 40, height: 'S' } },
  { name: 'Zeeshan Haider', mobile: '0331-2765480', area: 'PECHS', address: 'House 88, Block 2, PECHS', type: 'REGULAR', size: { chest: 42, height: 'L' } },
  { name: 'Rizwan Baloch', mobile: '0346-2908134', area: 'Malir Cantt', address: 'House 17, Askari 5, Malir Cantt', type: 'REGULAR', size: { chest: 46, height: 'L' } },
  { name: 'Tariq Mehmood', mobile: '0300-8216470', area: 'Federal B Area', address: 'House C-21, Block 10, Federal B Area', type: 'REGULAR', size: { chest: 44, height: 'M' } },
  { name: 'Adnan Rajput', mobile: '0315-2483057', area: 'Gulistan-e-Jauhar', address: 'Flat B-404, Rufi Lake Drive, Block 18, Gulistan-e-Jauhar', type: 'REGULAR', size: { chest: 40, height: 'M' } },
  { name: 'Danish Iqbal', mobile: '0334-3619270', area: 'Bahadurabad', address: 'House 61, Bahadurabad, Block 3', type: 'VIP', size: { chest: 38, height: 'S' } },
  { name: 'Owais Raza', mobile: '0302-2573194', area: 'Korangi', address: 'House 1-B, Sector 33-A, Korangi No. 4', type: 'REGULAR', size: { chest: 42, height: 'M' } },
  { name: 'Junaid Abbasi', mobile: '0323-2096538', area: 'Gulberg', address: 'House L-9, Block 13, Gulberg (F.B. Area)', type: 'REGULAR', size: { chest: 40, height: 'L' } },
  { name: 'Hassan Farooqui', mobile: '0336-2840715', area: 'Tariq Road', address: 'Flat 12, Al-Habib Arcade, Tariq Road', type: 'REGULAR', size: { chest: 42, height: 'M' } },
  { name: 'Salman Ansari', mobile: '0305-2317468', area: 'Liaquatabad', address: 'House 4/245, Liaquatabad No. 4', type: 'WALK_IN', size: { chest: 44, height: 'S' } },
  { name: 'Noman Chishti', mobile: '0347-2659013', area: 'Shah Faisal Colony', address: 'House 77, Shah Faisal Colony No. 2', type: 'REGULAR', size: { chest: 40, height: 'M' } },
  { name: 'Ahsan Jamil', mobile: '0313-2784602', area: 'Bahria Town Karachi', address: 'Villa 235, Precinct 10, Bahria Town Karachi', type: 'REGULAR', openingBalance: '2000', size: { chest: 46, height: 'L' } },
  { name: 'Kashif Mirza', mobile: '0308-2195637', area: 'Defence View', address: 'House 14, Phase 2, Defence View', type: 'REGULAR', size: { chest: 38, height: 'M' } },
  { name: 'Saad Hashmi', mobile: '0320-4372819', area: 'Garden East', address: 'Flat 3, Rimpa Plaza, Garden East', type: 'REGULAR', size: { chest: 42, height: 'S' } },
  { name: 'Ali Raza Jafri', mobile: '0335-2916084', area: 'Ancholi', address: 'House B-60, Ancholi Society', type: 'REGULAR', size: { chest: 40, height: 'M' } },
  { name: 'Umer Lakhani', mobile: '0300-2681347', area: 'Clifton', address: 'Bungalow 5, Block 5, Clifton', type: 'VIP', email: 'umer.lakhani@example.com', size: { chest: 42, height: 'L' } },
  { name: 'Waseem Akram Baig', mobile: '0310-2547892', area: 'Surjani Town', address: 'House 132, Sector 4-A, Surjani Town', type: 'WALK_IN', size: { chest: 40, height: 'M' } },
  { name: 'Shield Security Services (Uniforms)', mobile: '0321-2004718', area: 'SITE Area', address: 'Plot F-42, SITE Area', type: 'CORPORATE', note: 'Staff uniforms. Contact: Mr. Shakeel (Admin).', size: { chest: 42, height: 'M' } },
];

export interface DemoSupplier {
  key: string;
  name: string;
  contact: string;
  address: string;
  openingBalance?: string;
  note?: string;
}

export const DEMO_SUPPLIERS: DemoSupplier[] = [
  { key: 'S1', name: 'Al-Karim Cloth House', contact: '0321-2456781', address: 'Shop 14, Gani Market, Jodia Bazaar', note: 'Wash & wear and cotton wholesale.' },
  { key: 'S2', name: 'Bolton Market Textile Traders', contact: '0300-2238104', address: 'Shop 6, Bolton Market, M.A. Jinnah Road', note: 'Boski and karandi.' },
  { key: 'S3', name: 'Faisal Suiting Centre', contact: '0333-2109384', address: 'Shop 3, Tariq Road', note: 'Suiting fabric for coats and pants.' },
  { key: 'S4', name: 'Madina Wash & Wear Wholesale', contact: '0345-2096137', address: 'Shop 41, Jodia Bazaar', note: 'Gives 30 days credit.' },
  { key: 'S5', name: 'Sindh Cotton Agency', contact: '0312-2675910', address: 'Plot B-12, SITE Area', openingBalance: '25000', note: 'Old balance carried forward.' },
];

export interface DemoFabric {
  key: string;
  name: string;
  category: string;
  color: string;
  quality: string;
  brand: string;
  supplier: string;
  purchasePrice: string;
  salePrice: string;
  opening: string;
  minimum: string;
  location: string;
}

export const DEMO_FABRICS: DemoFabric[] = [
  { key: 'F1', name: 'Premium Wash & Wear', category: 'Wash & Wear', color: 'Off White', quality: 'Super 100', brand: 'Local', supplier: 'S1', purchasePrice: '520', salePrice: '750', opening: '120', minimum: '30', location: 'Rack A-1' },
  { key: 'F2', name: 'Premium Wash & Wear', category: 'Wash & Wear', color: 'Sky Blue', quality: 'Super 100', brand: 'Local', supplier: 'S1', purchasePrice: '520', salePrice: '750', opening: '90', minimum: '30', location: 'Rack A-2' },
  { key: 'F3', name: 'Premium Wash & Wear', category: 'Wash & Wear', color: 'Charcoal Grey', quality: 'Super 120', brand: 'Local', supplier: 'S4', purchasePrice: '540', salePrice: '780', opening: '70', minimum: '25', location: 'Rack A-3' },
  { key: 'F4', name: 'Egyptian Cotton', category: 'Cotton', color: 'White', quality: 'Giza', brand: 'Imported', supplier: 'S5', purchasePrice: '650', salePrice: '900', opening: '80', minimum: '20', location: 'Rack B-1' },
  { key: 'F5', name: 'Latha Lawn', category: 'Latha', color: 'White', quality: 'Fine', brand: 'Faisalabad Mills', supplier: 'S5', purchasePrice: '380', salePrice: '550', opening: '100', minimum: '25', location: 'Rack B-2' },
  { key: 'F6', name: 'Pure Boski', category: 'Boski', color: 'Golden', quality: 'Silk Touch', brand: 'Local', supplier: 'S2', purchasePrice: '1450', salePrice: '1950', opening: '40', minimum: '10', location: 'Rack C-1' },
  { key: 'F7', name: 'Karandi Winter', category: 'Karandi', color: 'Brown', quality: 'Heavy', brand: 'Local', supplier: 'S2', purchasePrice: '950', salePrice: '1350', opening: '50', minimum: '15', location: 'Rack C-2' },
  { key: 'F8', name: 'Soft Khaddar', category: 'Khaddar', color: 'Black', quality: 'Soft', brand: 'Local', supplier: 'S2', purchasePrice: '700', salePrice: '1000', opening: '45', minimum: '15', location: 'Rack C-3' },
  { key: 'F9', name: 'Linen Blend', category: 'Linen', color: 'Beige', quality: 'Summer', brand: 'Imported', supplier: 'S3', purchasePrice: '820', salePrice: '1150', opening: '35', minimum: '10', location: 'Rack D-1' },
  { key: 'F10', name: 'Italian Look Suiting', category: 'Suiting', color: 'Navy Blue', quality: 'Super 130', brand: 'Imported', supplier: 'S3', purchasePrice: '2200', salePrice: '3000', opening: '30', minimum: '10', location: 'Rack E-1' },
  { key: 'F11', name: 'Tropical Suiting', category: 'Suiting', color: 'Black', quality: 'Light', brand: 'Imported', supplier: 'S3', purchasePrice: '1800', salePrice: '2500', opening: '25', minimum: '10', location: 'Rack E-2' },
  { key: 'F12', name: 'Cotton Blended', category: 'Blended', color: 'Mint Green', quality: 'Standard', brand: 'Local', supplier: 'S4', purchasePrice: '480', salePrice: '700', opening: '8', minimum: '20', location: 'Rack B-3' },
];

export interface DemoPurchase {
  supplier: string;
  daysAgo: number;
  invoice: string;
  lines: { fabric: string; quantity: string; rate: string }[];
  paid?: { amount: string; method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' };
  otherCharges?: string;
  notes?: string;
}

export const DEMO_PURCHASES: DemoPurchase[] = [
  { supplier: 'S1', daysAgo: 45, invoice: 'AK-4471', lines: [{ fabric: 'F1', quantity: '60', rate: '510' }, { fabric: 'F2', quantity: '40', rate: '515' }], paid: { amount: '40000', method: 'CASH' }, otherCharges: '800', notes: 'Rickshaw / loading charges included.' },
  { supplier: 'S3', daysAgo: 32, invoice: 'FSC-1182', lines: [{ fabric: 'F10', quantity: '25', rate: '2150' }, { fabric: 'F11', quantity: '20', rate: '1780' }], paid: { amount: '89350', method: 'BANK_TRANSFER' } },
  { supplier: 'S4', daysAgo: 21, invoice: 'MWW-0937', lines: [{ fabric: 'F3', quantity: '40', rate: '530' }, { fabric: 'F12', quantity: '15', rate: '470' }] },
  { supplier: 'S2', daysAgo: 12, invoice: 'BMT-2290', lines: [{ fabric: 'F6', quantity: '20', rate: '1420' }, { fabric: 'F7', quantity: '30', rate: '930' }], paid: { amount: '30000', method: 'CASH' } },
  { supplier: 'S5', daysAgo: 4, invoice: 'SCA-7765', lines: [{ fabric: 'F4', quantity: '40', rate: '640' }, { fabric: 'F5', quantity: '50', rate: '375' }] },
];

/** Later payment to a supplier: [supplier, days ago, amount, method]. */
export const DEMO_SUPPLIER_PAYMENTS: [string, number, string, 'CASH' | 'BANK_TRANSFER' | 'CHEQUE'][] = [
  ['S4', 7, '25000', 'CHEQUE'],
  ['S5', 15, '15000', 'BANK_TRANSFER'],
];

export interface DemoEmployee {
  key: string;
  name: string;
  fatherName: string;
  contact: string;
  cnic: string;
  address: string;
  designation: string;
  type: 'TAILOR' | 'MASTER_TAILOR' | 'CUTTER' | 'HELPER' | 'FINISHING_STAFF' | 'SALES_STAFF';
  employment: 'PERMANENT' | 'CONTRACT' | 'TEMPORARY';
  /** Joining date, or 'PREV_MONTH_10' = the 10th of last month (shows a part-month salary). */
  joining: string;
  salary: { salaryType: 'MONTHLY' | 'DAILY' | 'PER_PIECE' | 'FIXED_PLUS_INCENTIVE'; monthlySalary?: string; dailyWage?: string; perPieceRate?: string; overtimeRatePerHour?: string };
  bank?: { name: string; title: string; account: string };
}

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  { key: 'E1', name: 'Ustad Abdul Rasheed', fatherName: 'Abdul Majeed', contact: '0300-2316745', cnic: '42101-3456712-3', address: 'House 45, Lines Area, Karachi', designation: 'Master Tailor', type: 'MASTER_TAILOR', employment: 'PERMANENT', joining: '2016-03-01', salary: { salaryType: 'MONTHLY', monthlySalary: '70000', overtimeRatePerHour: '400' }, bank: { name: 'Meezan Bank', title: 'Abdul Rasheed', account: '0101-0104567891' } },
  { key: 'E2', name: 'Muhammad Saleem', fatherName: 'Muhammad Yousuf', contact: '0321-2498310', cnic: '42201-5678123-5', address: 'Flat 9, Soldier Bazaar No. 2, Karachi', designation: 'Cutting Master', type: 'CUTTER', employment: 'PERMANENT', joining: '2019-07-15', salary: { salaryType: 'FIXED_PLUS_INCENTIVE', monthlySalary: '40000', perPieceRate: '120', overtimeRatePerHour: '300' } },
  { key: 'E3', name: 'Rafiq Ahmed', fatherName: 'Bashir Ahmed', contact: '0333-2781590', cnic: '42401-2345678-7', address: 'House 210, Orangi Town Sector 11, Karachi', designation: 'Shalwar Kameez Tailor', type: 'TAILOR', employment: 'PERMANENT', joining: '2020-01-10', salary: { salaryType: 'PER_PIECE', perPieceRate: '650' } },
  { key: 'E4', name: 'Imran Hussain', fatherName: 'Ghulam Hussain', contact: '0345-2617094', cnic: '42301-6789012-9', address: 'House 18, Lyari, Karachi', designation: 'Kurta and Shirt Tailor', type: 'TAILOR', employment: 'PERMANENT', joining: '2021-05-02', salary: { salaryType: 'PER_PIECE', perPieceRate: '650' } },
  { key: 'E5', name: 'Shahid Iqbal', fatherName: 'Muhammad Iqbal', contact: '0312-2905346', cnic: '42501-7890123-1', address: 'House 66, Landhi No. 6, Karachi', designation: 'Coat and Waistcoat Tailor', type: 'TAILOR', employment: 'CONTRACT', joining: '2022-09-01', salary: { salaryType: 'PER_PIECE', perPieceRate: '900' } },
  { key: 'E6', name: 'Naveed Akhtar', fatherName: 'Akhtar Ali', contact: '0302-2547813', cnic: '42101-8901234-3', address: 'House 5, Ranchore Line, Karachi', designation: 'Finishing and Pressing', type: 'FINISHING_STAFF', employment: 'PERMANENT', joining: '2023-02-20', salary: { salaryType: 'DAILY', dailyWage: '1600', overtimeRatePerHour: '200' } },
  { key: 'E7', name: 'Bilal Hussain', fatherName: 'Sajjad Hussain', contact: '0315-2093761', cnic: '42201-9012345-5', address: 'House 31, Jamshed Road, Karachi', designation: 'Helper', type: 'HELPER', employment: 'TEMPORARY', joining: 'PREV_MONTH_10', salary: { salaryType: 'DAILY', dailyWage: '1200' } },
  { key: 'E8', name: 'Faraz Ahmed', fatherName: 'Naseem Ahmed', contact: '0334-2768105', cnic: '42301-1234098-7', address: 'Flat 22, Gulshan-e-Iqbal Block 7, Karachi', designation: 'Counter Sales', type: 'SALES_STAFF', employment: 'PERMANENT', joining: '2024-04-01', salary: { salaryType: 'MONTHLY', monthlySalary: '38000', overtimeRatePerHour: '250' }, bank: { name: 'HBL', title: 'Faraz Ahmed', account: '1234-5678901-03' } },
];

/** Stitching price (PKR per piece) and the tailor piece rate per garment code. */
export const GARMENT_PRICES: Record<string, { price: number; vipPrice: number; pieceRate: number; tailor: string; cutRate: number }> = {
  SHALWAR_KAMEEZ: { price: 2800, vipPrice: 3500, pieceRate: 650, tailor: 'E3', cutRate: 120 },
  KURTA: { price: 2200, vipPrice: 2700, pieceRate: 450, tailor: 'E4', cutRate: 100 },
  WAISTCOAT: { price: 4000, vipPrice: 4800, pieceRate: 900, tailor: 'E5', cutRate: 150 },
  FORMAL_SUIT: { price: 16000, vipPrice: 19000, pieceRate: 3500, tailor: 'E5', cutRate: 400 },
  SHIRT: { price: 1800, vipPrice: 2200, pieceRate: 450, tailor: 'E4', cutRate: 100 },
  TROUSER: { price: 1600, vipPrice: 1900, pieceRate: 400, tailor: 'E4', cutRate: 100 },
  PANT: { price: 1800, vipPrice: 2200, pieceRate: 450, tailor: 'E4', cutRate: 100 },
};

/** Shop fabric needed per piece (metres). */
export const FABRIC_PER_PIECE: Record<string, number> = {
  SHALWAR_KAMEEZ: 4.5, KURTA: 2.5, WAISTCOAT: 1.25, FORMAL_SUIT: 3.25, SHIRT: 2, TROUSER: 1.25, PANT: 1.25,
};

export const SPECIAL_INSTRUCTIONS = [
  'Ban collar, two side pockets, double stitching.',
  'Shirt collar with cuffs. One front pocket.',
  'Round neck kurta, no side pockets.',
  'Loose fitting. Shalwar with elastic and drawstring.',
  'Wedding on Saturday - please finish early.',
  'Sherwani style buttons on the kameez.',
  'Slim fit. Keep the sleeves a little short.',
  'Eid order - same design as last time.',
  '',
  '',
];

/** Measurement in inches by field key, from chest size and height group. */
export function bodyMeasurements(chest: number, height: 'S' | 'M' | 'L'): Record<string, number> {
  const h = { S: -1.5, M: 0, L: 1.5 }[height];
  const waist = chest - 4;
  return {
    length: 41 + h, shoulder: 17 + (chest - 40) * 0.25, chest, waist, hip: chest + 1, sleeve_length: 24 + h * 0.5, armhole: 9.5 + (chest - 40) * 0.1,
    neck: 15 + (chest - 40) * 0.2, cuff: 4.5, shalwar_length: 40 + h, shalwar_waist: chest + 2, bottom_opening: 15,
    coat_length: 30 + h * 0.5, trouser_length: 40 + h, trouser_waist: waist, thigh: 24 + (chest - 40) * 0.3, knee: 17, bottom: 15,
    sleeve: 24 + h * 0.5, collar: 15.5 + (chest - 40) * 0.2, rise: 11,
  };
}

// ------------------------------------------------------------------ Phase 6/7: shop expenses, owner capital, saved report filters

/** [category, description, paid to, method, amount, bill / reference]. Monthly bills are made on these days of every demo month. */
export const DEMO_MONTHLY_EXPENSES: { day: number; category: string; description: string; paidTo: string; method: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_WALLET'; amounts: string[]; reference?: string }[] = [
  { day: 1, category: 'Shop Rent', description: 'Shop rent, Shop 14 Tariq Road', paidTo: 'Haji Abdul Ghaffar (landlord)', method: 'BANK_TRANSFER', amounts: ['85000'], reference: 'Meezan IBFT' },
  { day: 3, category: 'Cleaning & Security', description: 'Chowkidar and sweeper monthly', paidTo: 'Gul Khan (chowkidar)', method: 'CASH', amounts: ['6000'] },
  { day: 7, category: 'Internet & Phone', description: 'StormFiber internet 15 Mbps', paidTo: 'StormFiber', method: 'MOBILE_WALLET', amounts: ['3499'], reference: 'JazzCash bill payment' },
  { day: 9, category: 'Electricity', description: 'K-Electric bill (shop meter)', paidTo: 'K-Electric', method: 'BANK_TRANSFER', amounts: ['21840', '18460', '24115'], reference: 'KE consumer 0400012345678' },
  { day: 11, category: 'Gas', description: 'SSGC bill', paidTo: 'Sui Southern Gas Company', method: 'CASH', amounts: ['2150', '1980', '2430'] },
  { day: 12, category: 'Water', description: 'KW&SC water charges', paidTo: 'Karachi Water & Sewerage Corp.', method: 'CASH', amounts: ['1200'] },
];

/** Day-to-day expenses: [days ago, category, description, paid to, method, amount]. */
export const DEMO_DAILY_EXPENSES: [number, string, string, string, 'CASH' | 'MOBILE_WALLET' | 'BANK_TRANSFER', string][] = [
  [58, 'Tailoring Accessories', 'Thread cones, buttons and interlining', 'Al-Madina Accessories, Jama Cloth Market', 'CASH', '7850'],
  [55, 'Staff Food & Tea', 'Doodh patti chai for staff (week)', 'Quetta Hotel, Tariq Road', 'CASH', '1400'],
  [52, 'Transport & Delivery', 'Bykea parcel delivery to DHA Phase 6', 'Bykea', 'MOBILE_WALLET', '420'],
  [50, 'Generator Fuel', 'Petrol for generator (load shedding)', 'PSO, Shahrah-e-Faisal', 'CASH', '2850'],
  [47, 'Stationery & Printing', 'Order receipt books (5) and job cards', 'Saddar Printing Press', 'CASH', '1800'],
  [45, 'Repairs & Maintenance', 'Juki machine service and needle plate', 'Bilal Sewing Machine Repair', 'CASH', '3500'],
  [41, 'Staff Food & Tea', 'Doodh patti chai for staff (week)', 'Quetta Hotel, Tariq Road', 'CASH', '1350'],
  [38, 'Marketing', 'Facebook page boost (Eid collection)', 'Meta Ads', 'BANK_TRANSFER', '3000'],
  [36, 'Transport & Delivery', 'Rickshaw to Jama Cloth Market and back', 'Rickshaw', 'CASH', '600'],
  [33, 'Tailoring Accessories', 'Collar canvas, kaj thread and labels', 'Al-Madina Accessories, Jama Cloth Market', 'CASH', '5400'],
  [30, 'Bank Charges', 'IBFT and SMS alert charges', 'Meezan Bank', 'BANK_TRANSFER', '150'],
  [27, 'Staff Food & Tea', 'Biryani lunch for staff (big order finished)', 'Student Biryani, Tariq Road', 'CASH', '2600'],
  [24, 'Generator Fuel', 'Petrol for generator (load shedding)', 'Shell, Tariq Road', 'CASH', '3100'],
  [20, 'Transport & Delivery', 'Bykea delivery to Bahria Town', 'Bykea', 'MOBILE_WALLET', '650'],
  [17, 'Repairs & Maintenance', 'Steam iron element replaced', 'Raza Electric Works', 'CASH', '1700'],
  [13, 'Staff Food & Tea', 'Doodh patti chai for staff (week)', 'Quetta Hotel, Tariq Road', 'CASH', '1450'],
  [10, 'Tailoring Accessories', 'Kurta buttons (fancy) and piping', 'Al-Madina Accessories, Jama Cloth Market', 'CASH', '4300'],
  [6, 'Miscellaneous', 'Shop signboard light repair', 'Raza Electric Works', 'CASH', '1200'],
  [3, 'Transport & Delivery', 'Bykea parcel delivery to Clifton', 'Bykea', 'MOBILE_WALLET', '380'],
];

/** Entered by staff (the demo Manager cannot approve), so they wait for the owner's approval. */
export const DEMO_PENDING_EXPENSES: [number, string, string, string, 'CASH', string][] = [
  [1, 'Staff Food & Tea', 'Doodh patti chai for staff (week)', 'Quetta Hotel, Tariq Road', 'CASH', '1500'],
  [0, 'Stationery & Printing', 'Measurement register and pens', 'Paper Point, Saddar', 'CASH', '950'],
];

export const DEMO_OWNER_CAPITAL = { cash: '150000', bank: '350000', description: 'Owner capital introduced (cash in hand and Meezan Bank account)' } as const;

/** Saved report filters for the demo login. */
export const DEMO_SAVED_FILTERS: { reportKey: string; name: string; params: Record<string, string> }[] = [
  { reportKey: 'delayed-orders', name: 'Late orders (biggest delay first)', params: { sort: 'daysLate', dir: 'desc' } },
  { reportKey: 'order-register', name: 'Unpaid orders this month', params: { preset: 'this_month', paymentStatus: 'UNPAID' } },
  { reportKey: 'expense-summary', name: 'Expenses last month', params: { preset: 'last_month' } },
];
