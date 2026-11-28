import type { GuideSection } from './types';

/** Guide sections: fabric, suppliers, purchases and staff / payroll. Text in Roman Urdu (owner's request). */
export const OPS_SECTIONS: GuideSection[] = [
  {
    id: 'inventory', part: 'fabric', title: 'Fabric Inventory', icon: 'Layers', path: '/inventory', module: 'inventory',
    summary: 'Fabric Inventory mein dukaan ka saara kapra, us ki miqdar (stock), qeemat aur har aane jaane ka record hai.',
    blocks: [
      { type: 'options', title: 'Cards', items: [
        { name: 'Active fabrics', text: 'Kitni qism ka kapra mojood hai.' },
        { name: 'Stock value', text: 'Saare kapre ki laagat ke hisaab se qeemat.' },
        { name: 'Reorder soon', text: 'Jo kapra kam (Low) ya khatam (Out) hai, dobara mangwana hai.' },
      ] },
      { type: 'steps', title: 'Naya kapra kaise add karein', items: [
        '**Fabric Inventory** kholein aur **Add fabric** dabaein.',
        '**Fabric name** (jaise Premium Wash & Wear), **Category**, **Brand**, **Colour**, **Design**, **Quality** likhein.',
        '**Unit** chunein: meter, yard, piece ya suit. (Stock chalne ke baad unit nahi badalta.)',
        'Purchase price aur sale price likhein. Sale price order mein khud bhar jati hai.',
        '**Minimum stock** likhein: is se kam hone par "Low stock" ka alert aata hai.',
        '**Location** (jaise Rack A-3) aur **Usual supplier** chunein.',
        'Dukaan mein pehle se kapra hai to opening stock aur us ki laagat likhein. Save dabaein. Code khud banta hai (AZF-0001).',
      ] },
      { type: 'options', title: 'List ke options', items: [
        { name: 'Search / filters', text: 'Code, naam, brand ya rang se search; Category, Stock level (In stock, Low stock, Out of stock), Status aur Sort (Lowest stock first waghera).' },
        { name: 'Categories', text: 'Kapre ke groups (Wash & Wear, Cotton, Lawn, Khaddar, Boski, Suiting). Naya naam likh kar **Add**, ya naam badal kar **Save**.' },
        { name: 'New purchase', text: 'Supplier se aaya kapra darj karna (Purchases section).' },
        { name: 'Stock ledger tab', text: 'Har kapre ka har aana jaana: opening, purchase, return, adjustment, order mein istemal. Type, kapra aur tareekh se filter. Ye record badla ya mitaya nahi ja sakta.' },
      ] },
      { type: 'options', title: 'Kapre ka page (kapre par click karein)', items: [
        { name: 'In stock / Reserved for orders / Free to use', text: 'Kul kapra, jo orders ke liye alag rakha hai, aur jo abhi istemal ho sakta hai.' },
        { name: 'Buy more', text: 'Isi kapre ki nayi purchase.' },
        { name: 'Adjust stock', text: 'Ginti ke baad stock theek karna: **Add or remove**, miqdar, **Reason** (Physical count correction, Damaged / defective, Cutting waste, Lost / missing, Found in store, Sample given, Other) aur **Details**. Approve ki ijazat chahiye. Order ke liye reserve kapra nahi nikala ja sakta.' },
        { name: 'Edit', text: 'Kapre ki maloomat badalna.' },
        { name: 'Tabs', text: 'Details, Stock ledger, Purchases, aur orders jin ke liye kapra reserve hai.' },
      ] },
      { type: 'tip', text: 'Order mein "Shop fabric" chunne par kapra reserve hota hai, delivery par stock se nikal jata hai, aur cancel karne par wapas aa jata hai. Ye sab khud hota hai.' },
    ],
  },
  {
    id: 'suppliers', part: 'fabric', title: 'Suppliers', icon: 'Truck', path: '/suppliers', module: 'suppliers',
    summary: 'Suppliers wo log ya companies hain jin se aap kapra khareedte hain. Yahan un ka record aur aap ne unhein kitna dena hai, wo nazar aata hai.',
    blocks: [
      { type: 'steps', title: 'Naya supplier kaise add karein', items: [
        '**Suppliers** kholein aur **Add supplier** dabaein.',
        '**Supplier name**, **Phone**, **WhatsApp** (ya **Same as phone**), **City** aur **Address** likhein.',
        'ERP se pehle ka udhaar ho to **Amount you owe now (Rs)** mein likhein.',
        'Save dabaein. Code khud banta hai (AZS-0001).',
      ] },
      { type: 'options', title: 'Options', items: [
        { name: 'Cards', text: 'Total payable (kul dena hai), Suppliers to pay (kitne suppliers ka udhaar hai), Active suppliers.' },
        { name: 'Balance filter', text: 'Any balance ya Money owed (sirf jin ka dena hai).' },
        { name: 'Supplier page', text: '**Call**, **WhatsApp**, **New purchase**, **Pay supplier**, **Edit**. Tabs: Purchases, Payments, Ledger (khata), Fabrics, Details.' },
      ] },
      { type: 'steps', title: 'Supplier ko payment kaise karein', items: [
        'Supplier ka page kholein aur **Pay supplier** dabaein (ya purchase ke andar **Pay this bill**).',
        '**Amount (Rs)**, **Method** (Cash, Bank, JazzCash / Easypaisa, Cheque) aur **Reference** likhein.',
        'Kisi ek bill ke liye hai to wo bill chunein, warna payment sab se purane bill se shuru ho kar lagti hai.',
        '**Save payment** dabaein. Number khud banta hai (SPY-...).',
      ] },
    ],
  },
  {
    id: 'purchases', part: 'fabric', title: 'Purchases', icon: 'ShoppingCart', path: '/purchases', module: 'purchases',
    summary: 'Purchase yaani supplier ka bill. Bill save karte hi kapra stock mein aa jata hai aur supplier ka udhaar barh jata hai.',
    blocks: [
      { type: 'steps', title: 'Nayi purchase (bill) kaise darj karein', items: [
        '**Purchases** kholein aur **New purchase** dabaein (Dashboard par **Receive Fabric** bhi yahi hai).',
        '**Supplier** chunein (naya ho to **Add new supplier**).',
        '**Supplier bill no.** (jaise INV-4471) aur **Bill date** likhein. Ek supplier ka ek bill number do dafa nahi chalta.',
        '**Fabrics on this bill** mein kapra chunein, miqdar aur rate likhein. Aur line ke liye **Add line**, bilkul naya kapra ho to **New fabric**.',
        '**Discount** aur **Freight / other** (kiraya, mazdoori) likhein. Ye kharcha kapre ki laagat mein barabar baant diya jata hai.',
        'Abhi kuch paisa diya to **Paid now**, **Payment method** aur reference likhein. **Balance to pay** khud nazar aata hai.',
        '**Save purchase** dabaein.',
      ] },
      { type: 'options', title: 'Purchase ke page par', items: [
        { name: 'Print', text: 'Purchase ka record print karna.' },
        { name: 'Pay this bill', text: 'Is bill ki baqi raqam ada karna.' },
        { name: 'Return to supplier', text: 'Kuch kapra wapas karna: miqdar chunein, **Reason** likhein (jaise "Rang sample se nahi milta") aur **Save return** dabaein. Stock kam hota hai aur supplier ka udhaar bhi.' },
      ] },
      { type: 'options', title: 'List ke filters', items: [
        { name: 'Payment', text: 'Any payment, To pay (baqi), Paid.' },
        { name: 'From date / To date', text: 'Tareekh ke hisaab se bills.' },
        { name: 'Still to pay', text: 'Upar card: suppliers ko kul kitna dena hai.' },
      ] },
    ],
  },
  {
    id: 'employees', part: 'staff', title: 'Employees', icon: 'IdCard', path: '/employees', module: 'employees',
    summary: 'Employees mein saare karigar aur staff ka record hai: maloomat, salary, advance aur kaam.',
    blocks: [
      { type: 'steps', title: 'Naya employee kaise add karein', items: [
        '**Employees** kholein aur **Add employee** dabaein.',
        '**Personal & job** hissa: **Full name**, **Father\'s name**, **Mobile**, **CNIC** (35202-1234567-1), **Work type** (Tailor, Master tailor, Cutter, Helper, Finishing, Sales, Other), **Designation**, **Employment**, **Joining date**, **Address**. Phir **Next: Salary**.',
        '**Salary** hissa: **Salary type** chunein: Monthly (mahana), Daily wage (dihari), Per piece (fi piece), ya Fixed + per piece. Raqam likhein aur **Overtime rate per hour (Rs)** bhi.',
        '**Bank & notes** hissa: **Bank**, **Account title**, **Account / IBAN** aur notes.',
        'Save dabaein. Code khud banta hai (AZE-0001).',
      ] },
      { type: 'options', title: 'Employee ke page ke buttons', items: [
        { name: 'Call', text: 'Employee ko call karna.' },
        { name: 'Give advance', text: 'Peshgi (advance) dena: **Amount (Rs)**, **Cut per salary (Rs)** (har salary se kitna katega; khaali chhorein to poora agli salary se), **Paid by** aur **Date**. Advance salary se khud katta hai.' },
        { name: 'Change salary', text: 'Nayi salary kis tareekh se lagu ho (**New salary from**) aur **Reason** (jaise saalana izafa). Purane mahine purani salary par hi rehte hain.' },
        { name: 'Status', text: 'Active, On leave, Inactive, Left the job. Naukri chhorne par aakhri din likhein; salary usi din tak banegi.' },
        { name: 'Edit / Delete employee', text: 'Maloomat badalna. Delete sirf tab hota hai jab koi attendance, advance, payroll ya kaam ka record na ho; warna status "Left the job" karein.' },
      ] },
      { type: 'options', title: 'Tabs', items: [
        { name: 'Salary', text: 'Salary ki poori history.' },
        { name: 'Advances', text: 'Saare advance, kitna wusool hua, kitna baqi. **Write off** se baqi advance maaf (wapas nahi hoga).' },
        { name: 'Payslips', text: 'Har mahine ki salary slip (**Print payslip**).' },
        { name: 'Work', text: 'Production mein darj kiye gaye mukammal piece.' },
        { name: 'Leave & overtime', text: 'Chhuttiyan aur overtime.' },
        { name: 'Details', text: 'Saari maloomat aur naukri ki history.' },
      ] },
      { type: 'tip', text: 'List par upar cards: Current staff, Present today (aaj haazir), Monthly salaries, Advances to recover. **Mark attendance** button seedha haazri ka page kholta hai.' },
    ],
  },
  {
    id: 'attendance', part: 'staff', title: 'Attendance', icon: 'CalendarCheck', path: '/attendance', module: 'attendance',
    summary: 'Attendance mein rozana haazri, mahane ka register, chhuttiyan (leave) aur overtime hain. Monthly salary mein ghair haazri ke din isi se katte hain.',
    blocks: [
      { type: 'steps', title: 'Rozana haazri (Daily tab)', items: [
        '**Attendance** kholein, **Daily** tab mein tareekh check karein (**Today**, ya teer se pichla / agla din).',
        'Har employee ke saamne ek tap: Present, Absent, Half day, Leave ya Holiday. Chahein to aane / jaane ka waqt likhein.',
        'Sab haazir hain to **Mark rest present** dabaein: jo baqi hain sab Present ho jayenge. Chhutti ka din ho to **Mark rest holiday**.',
        'Neeche patti par **Save attendance** dabaein. Ghalti ho to save se pehle **Undo**.',
      ] },
      { type: 'options', title: 'Doosre tabs', items: [
        { name: 'Monthly register', text: 'Poore mahine ka chart: P (Present), A (Absent), H (Half day), L (Leave), O (Off) aur totals. **Print** bhi ho sakta hai.' },
        { name: 'Leave', text: '**Add leave**: Employee, **Leave type** (Casual, Sick, Annual, Unpaid, Other), From / To aur Reason. Phir **Approve** ya **Reject**. Approve hone par din haazri mein Leave lag jate hain; Unpaid leave Absent shumar hoti hai (salary katti hai).' },
        { name: 'Overtime', text: '**Add overtime**: Date, Hours, Rs / hour (salary se khud aata hai) aur Notes. Approve hone ke baad payroll mein salary mein judta hai.' },
      ] },
      { type: 'warning', text: 'Jis mahine ka payroll Approve ho chuka, us mahine ki haazri, overtime aur production lock ho jati hai. Badalni ho to pehle payroll **Reopen** karein.' },
    ],
  },
  {
    id: 'production', part: 'staff', title: 'Production', icon: 'Scissors', path: '/production', module: 'production',
    summary: 'Production mein har karigar ke mukammal kiye hue piece darj hote hain. Per piece wale karigaron ki salary inhi records se banti hai.',
    blocks: [
      { type: 'steps', title: 'Kaam kaise darj karein', items: [
        '**Production** kholein aur **Record work** dabaein.',
        '**Employee** chunein.',
        '**Order** mein order number ya customer ka naam likh kar order aur garment chunein.',
        '**Work** chunein: Cutting, Stitching, Finishing, Alteration, Embroidery, Pressing ya Other.',
        '**Pieces** (kitne piece) aur **Date** likhein. **Rs / piece** khud Garments ke rate se aata hai; rate na ho to khud likhein.',
        '**Save work** dabaein.',
      ] },
      { type: 'options', title: 'Options', items: [
        { name: 'Cards', text: 'Pieces completed aur Piece wages (is mahine).' },
        { name: 'Filters', text: 'Month, Paid & unpaid / Not yet paid / Paid, aur search.' },
        { name: 'Remove', text: 'Ghalat entry hatana (sirf jab tak us ki payment na hui ho).' },
      ] },
      { type: 'tip', text: 'Ek garment ke jitne piece hain us se zyada ek hi kaam ke piece darj nahi ho sakte, is se dohri entry nahi hoti.' },
    ],
  },
  {
    id: 'payroll', part: 'staff', title: 'Payroll', icon: 'Wallet', path: '/payroll', module: 'payroll',
    summary: 'Payroll mahine ke aakhir mein har employee ki salary khud hisaab karta hai: salary, haazri, production, overtime aur advance ki kattoti ke saath.',
    blocks: [
      { type: 'steps', title: 'Mahane ki salary kaise banaein', items: [
        'Pehle poore mahine ki haazri lagaein, overtime approve karein aur saara production darj karein.',
        '**Payroll** kholein aur **Run payroll** dabaein.',
        '**Month** chunein, chahein to **Notes** likhein, aur **Calculate payroll** dabaein. Payroll "Draft" ban jata hai.',
        'Har employee ki salary check karein. Bonus ya kattoti ke liye pencil (**Adjust**) dabaein: **Bonus**, **Incentive**, **Advance cut**, **Other deduction** aur **Note on payslip** (jaise Eid bonus).',
        'Haazri ya kaam badla ho to **Recalculate** dabaein (bonus waghera qaim rehte hain).',
        'Sab theek ho to **Approve** dabaein. Mahina lock ho jata hai aur advance ki kattoti lag jati hai.',
        'Salary dene ke liye har employee ke saamne **Pay** (poori ya kuch) ya sab ko ek saath **Pay all** dabaein. Method, date aur reference likhein.',
        '**Print all payslips** se saari salary slips chhapein, ya employee ke saamne **Payslip**.',
      ] },
      { type: 'options', title: 'Hisaab kaise banta hai', items: [
        { name: 'Monthly', text: 'Salary minus ghair haazri (salary / mahine ke din x absent din; half day aadha). Jo din mark nahi hue wo nahi katte.' },
        { name: 'Daily wage', text: 'Dihari x haazir din (half day aadha).' },
        { name: 'Per piece', text: 'Production ke baghair payment wale piece x rate.' },
        { name: 'Fixed + per piece', text: 'Dono jama.' },
        { name: 'Overtime / Advance', text: 'Approved overtime judta hai; advance ki qist katti hai (salary se zyada kabhi nahi).' },
      ] },
      { type: 'options', title: 'Doosre buttons aur tabs', items: [
        { name: 'Reopen', text: 'Approved payroll ko wapas Draft karna (sirf jab koi salary ada na hui ho). Mahina khul jata hai.' },
        { name: 'Delete draft', text: 'Draft payroll mitana; dobara bana sakte hain.' },
        { name: 'Monthly payroll tab', text: 'Har mahine ka payroll aur status (Draft, Approved, Partly paid, Paid).' },
        { name: 'Advances tab', text: 'Saare employees ke advance: Open, Recovered, Written off.' },
      ] },
    ],
  },
];
