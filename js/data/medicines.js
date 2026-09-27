/*
 * SAMPLE medicine catalogue for the prototype.
 *
 * IMPORTANT: prices here are ILLUSTRATIVE demo values, not official PMBI MRPs
 * and not live market prices. Brand names are used only to show how
 * "brand -> generic" lookup works. Always verify at a Kendra / pharmacy.
 *
 * The real Jan Aushadhi basket has ~2,000 medicines + ~300 surgicals. That is
 * small enough (a few hundred KB) to ship with the app and search offline,
 * which is the main fix for the "Please wait" lag.
 *
 * Row format (kept compact so the file stays small):
 *   [id, salt, strength, form, pack, category, class, JA price (Rs), Rx needed,
 *    "Brand:price|Brand:price", optional display name, optional availability factor]
 * Brand prices are for the same pack size as the Jan Aushadhi pack.
 */
(function (factory) {
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else { window.JA = window.JA || {}; window.JA.catalog = catalog; }
})(function () {
  'use strict';

  var CATEGORIES = {
    pain:    { en: 'Pain & Fever',            hi: 'दर्द और बुखार' },
    anti:    { en: 'Infections',              hi: 'संक्रमण' },
    diab:    { en: 'Diabetes',                hi: 'मधुमेह (शुगर)' },
    heart:   { en: 'Heart & BP',              hi: 'हृदय और बीपी' },
    gastro:  { en: 'Stomach & Digestion',     hi: 'पेट और पाचन' },
    resp:    { en: 'Cough, Cold & Allergy',   hi: 'खांसी, जुकाम, एलर्जी' },
    vit:     { en: 'Vitamins & Supplements',  hi: 'विटामिन' },
    skin:    { en: 'Skin',                    hi: 'त्वचा' },
    neuro:   { en: 'Brain & Nerves',          hi: 'दिमाग और नसें' },
    hormone: { en: 'Thyroid & Hormones',      hi: 'थायरॉइड और हार्मोन' },
    eye:     { en: 'Eye & Ear',               hi: 'आंख और कान' },
    surg:    { en: 'Surgicals & Devices',     hi: 'सर्जिकल और उपकरण' }
  };

  // label, what it is used for, extra search keywords (English/Hinglish/Hindi),
  // family = related classes that a doctor might consider as an alternative.
  var CLASSES = {
    'antipyretic':        { label: 'Analgesic / antipyretic', uses: 'Fever, headache and mild body pain', kw: 'fever bukhar बुखार dard दर्द headache sar', family: 'pain' },
    'nsaid':              { label: 'NSAID pain reliever', uses: 'Pain, swelling and inflammation', kw: 'pain dard दर्द painkiller swelling', family: 'pain' },
    'topical-analgesic':  { label: 'Pain-relief gel', uses: 'Muscle and joint pain (apply on skin)', kw: 'pain gel spray joint muscle dard' },
    'antispasmodic':      { label: 'Antispasmodic', uses: 'Stomach cramps and period pain', kw: 'cramps period pet dard पेट' },
    'penicillin':         { label: 'Penicillin antibiotic', uses: 'Bacterial infections of throat, ear, chest and teeth', kw: 'antibiotic infection' },
    'macrolide':          { label: 'Macrolide antibiotic', uses: 'Throat, chest and skin bacterial infections', kw: 'antibiotic infection' },
    'cephalosporin':      { label: 'Cephalosporin antibiotic', uses: 'Urinary, chest and typhoid infections', kw: 'antibiotic infection typhoid' },
    'fluoroquinolone':    { label: 'Fluoroquinolone antibiotic', uses: 'Urinary, stomach and chest infections', kw: 'antibiotic infection uti' },
    'tetracycline':       { label: 'Tetracycline antibiotic', uses: 'Chest, skin and some tropical infections', kw: 'antibiotic infection' },
    'nitroimidazole':     { label: 'Anti-amoebic antibiotic', uses: 'Amoebic dysentery, dental and gut infections', kw: 'antibiotic loose motion dysentery' },
    'sulfonamide':        { label: 'Sulfonamide antibiotic', uses: 'Urinary and chest infections', kw: 'antibiotic infection' },
    'anthelmintic':       { label: 'Deworming medicine', uses: 'Worm infections', kw: 'worm keede deworm कीड़े' },
    'antifungal-oral':    { label: 'Oral antifungal', uses: 'Fungal (yeast) infections', kw: 'fungal fungus' },
    'antiviral':          { label: 'Antiviral', uses: 'Herpes, cold sores and shingles', kw: 'virus' },
    'biguanide':          { label: 'Biguanide', uses: 'Type 2 diabetes (first-line)', kw: 'sugar diabetes शुगर मधुमेह', family: 'diabetes' },
    'sulfonylurea':       { label: 'Sulfonylurea', uses: 'Type 2 diabetes (helps release insulin)', kw: 'sugar diabetes शुगर', family: 'diabetes' },
    'sulfonylurea-biguanide': { label: 'Sulfonylurea + biguanide', uses: 'Type 2 diabetes', kw: 'sugar diabetes शुगर', family: 'diabetes' },
    'dpp4':               { label: 'DPP-4 inhibitor (gliptin)', uses: 'Type 2 diabetes', kw: 'sugar diabetes शुगर gliptin', family: 'diabetes' },
    'glitazone':          { label: 'Glitazone', uses: 'Type 2 diabetes', kw: 'sugar diabetes शुगर', family: 'diabetes' },
    'agi':                { label: 'Alpha-glucosidase inhibitor', uses: 'Type 2 diabetes (after-meal sugar)', kw: 'sugar diabetes शुगर', family: 'diabetes' },
    'sglt2':              { label: 'SGLT2 inhibitor', uses: 'Type 2 diabetes, heart failure, kidney protection', kw: 'sugar diabetes शुगर', family: 'diabetes' },
    'insulin':            { label: 'Insulin', uses: 'Diabetes needing insulin', kw: 'sugar diabetes शुगर injection' },
    'ccb':                { label: 'Calcium channel blocker', uses: 'High blood pressure, angina', kw: 'bp blood pressure बीपी hypertension', family: 'bp' },
    'arb':                { label: 'Angiotensin receptor blocker (ARB)', uses: 'High blood pressure, kidney protection', kw: 'bp blood pressure बीपी hypertension', family: 'bp' },
    'arb-combo':          { label: 'ARB combination', uses: 'High blood pressure', kw: 'bp blood pressure बीपी', family: 'bp' },
    'ace':                { label: 'ACE inhibitor', uses: 'High blood pressure, heart failure', kw: 'bp blood pressure बीपी', family: 'bp' },
    'beta-blocker':       { label: 'Beta blocker', uses: 'High blood pressure, fast heart rate, angina', kw: 'bp blood pressure बीपी heart', family: 'bp' },
    'diuretic':           { label: 'Diuretic (water pill)', uses: 'Swelling, high blood pressure', kw: 'bp swelling सूजन', family: 'bp' },
    'statin':             { label: 'Statin', uses: 'High cholesterol, heart attack prevention', kw: 'cholesterol lipid' },
    'antiplatelet':       { label: 'Antiplatelet (blood thinner)', uses: 'Prevents heart attack and stroke', kw: 'blood thinner heart' },
    'nitrate':            { label: 'Nitrate', uses: 'Chest pain (angina)', kw: 'chest pain angina heart' },
    'ppi':                { label: 'Proton pump inhibitor', uses: 'Acidity, ulcers, reflux', kw: 'acidity gas एसिडिटी jalan heartburn', family: 'acidity' },
    'ppi-prokinetic':     { label: 'PPI + anti-vomiting combination', uses: 'Acidity with bloating or nausea', kw: 'acidity gas एसिडिटी', family: 'acidity' },
    'h2':                 { label: 'H2 blocker', uses: 'Acidity and heartburn', kw: 'acidity gas एसिडिटी', family: 'acidity' },
    'antacid':            { label: 'Antacid', uses: 'Acidity, gas and heartburn', kw: 'acidity gas एसिडिटी', family: 'acidity' },
    'antiemetic':         { label: 'Anti-vomiting', uses: 'Nausea and vomiting', kw: 'vomit ulti उल्टी nausea' },
    'ors':                { label: 'Oral rehydration', uses: 'Dehydration from diarrhoea or heat', kw: 'dehydration loose motion dast दस्त' },
    'laxative':           { label: 'Laxative', uses: 'Constipation', kw: 'constipation kabz कब्ज' },
    'antidiarrheal':      { label: 'Anti-diarrhoeal', uses: 'Loose motions', kw: 'loose motion dast दस्त diarrhoea' },
    'bile-acid':          { label: 'Bile acid', uses: 'Gallstones and fatty liver (as advised)', kw: 'liver gallstone' },
    'antihistamine':      { label: 'Antihistamine', uses: 'Allergy, sneezing, itching, hives', kw: 'allergy एलर्जी sneezing cold itching', family: 'allergy' },
    'leukotriene':        { label: 'Leukotriene blocker', uses: 'Asthma and allergic rhinitis', kw: 'allergy asthma एलर्जी', family: 'allergy' },
    'bronchodilator':     { label: 'Bronchodilator inhaler', uses: 'Asthma / COPD (quick relief)', kw: 'asthma saans सांस inhaler', family: 'asthma' },
    'ics-laba':           { label: 'Steroid + bronchodilator inhaler', uses: 'Asthma / COPD (daily control)', kw: 'asthma saans सांस inhaler', family: 'asthma' },
    'mucolytic':          { label: 'Mucolytic', uses: 'Cough with thick mucus', kw: 'cough khansi खांसी syrup' },
    'cold-combo':         { label: 'Cold relief combination', uses: 'Common cold, blocked nose, fever', kw: 'cold jukam जुकाम nose' },
    'decongestant':       { label: 'Nasal decongestant', uses: 'Blocked nose', kw: 'cold nose jukam जुकाम' },
    'corticosteroid':     { label: 'Oral steroid', uses: 'Allergy, asthma, inflammation (as prescribed)', kw: 'steroid' },
    'vitamin-d':          { label: 'Vitamin D', uses: 'Vitamin D deficiency, bone health', kw: 'vitamin vit bones' },
    'calcium':            { label: 'Calcium supplement', uses: 'Bone health, calcium deficiency', kw: 'bones haddi हड्डी' },
    'b12':                { label: 'Vitamin B12', uses: 'B12 deficiency, nerve health', kw: 'vitamin vit nerves' },
    'iron':               { label: 'Iron supplement', uses: 'Anaemia (low haemoglobin)', kw: 'khoon खून anaemia blood hb' },
    'folate':             { label: 'Folic acid', uses: 'Pregnancy, anaemia', kw: 'pregnancy vitamin' },
    'multivitamin':       { label: 'Multivitamin', uses: 'General nutritional support', kw: 'vitamin vit weakness kamzori कमजोरी' },
    'b-complex':          { label: 'Vitamin B-complex', uses: 'Vitamin B deficiency, mouth ulcers', kw: 'vitamin vit ulcer chhale' },
    'vitamin-c':          { label: 'Vitamin C', uses: 'Vitamin C deficiency, immunity support', kw: 'vitamin vit immunity' },
    'antifungal-topical': { label: 'Antifungal cream', uses: 'Ringworm, fungal skin infection', kw: 'fungal daad दाद ringworm itching khujli' },
    'antibacterial-topical': { label: 'Antibiotic cream', uses: 'Infected cuts, boils, impetigo', kw: 'wound cut boil' },
    'steroid-topical':    { label: 'Steroid cream', uses: 'Eczema, skin allergy (short-term)', kw: 'eczema rash itching' },
    'scabicide':          { label: 'Anti-scabies', uses: 'Scabies and lice', kw: 'scabies khujli खुजली lice' },
    'soothing':           { label: 'Soothing lotion', uses: 'Itching, rashes, sunburn', kw: 'itching khujli rash' },
    'burn':               { label: 'Burn cream', uses: 'Burns and wounds', kw: 'burn jalna जलना wound' },
    'neuropathic':        { label: 'Nerve pain medicine', uses: 'Nerve pain (diabetes, sciatica)', kw: 'nerve pain neuropathy' },
    'antiepileptic':      { label: 'Anti-epileptic', uses: 'Epilepsy / fits', kw: 'fits mirgi मिर्गी seizure' },
    'ssri':               { label: 'SSRI antidepressant', uses: 'Depression, anxiety', kw: 'depression anxiety' },
    'tca':                { label: 'Tricyclic (low dose)', uses: 'Nerve pain, sleep, depression', kw: 'sleep depression' },
    'antivertigo':        { label: 'Anti-vertigo', uses: 'Vertigo, dizziness', kw: 'chakkar चक्कर vertigo dizziness' },
    'migraine':           { label: 'Migraine prevention', uses: 'Migraine prevention, vertigo', kw: 'migraine headache chakkar' },
    'thyroid':            { label: 'Thyroid hormone', uses: 'Hypothyroidism (low thyroid)', kw: 'thyroid थायरॉइड' },
    'antithyroid':        { label: 'Antithyroid', uses: 'Hyperthyroidism (overactive thyroid)', kw: 'thyroid थायरॉइड' },
    'alpha-blocker':      { label: 'Alpha blocker', uses: 'Enlarged prostate, urine flow', kw: 'prostate urine' },
    'eye-lubricant':      { label: 'Lubricant eye drops', uses: 'Dry eyes', kw: 'eye aankh आंख drops dry' },
    'eye-antibiotic':     { label: 'Antibiotic eye/ear drops', uses: 'Eye and ear bacterial infections', kw: 'eye ear aankh kaan drops' },
    'glucometer':         { label: 'Blood sugar meter', uses: 'Home blood sugar testing', kw: 'sugar machine glucometer meter', family: 'glucose-testing' },
    'glucose-strips':     { label: 'Glucose test strips', uses: 'Home blood sugar testing', kw: 'sugar strips', family: 'glucose-testing' },
    'sanitary':           { label: 'Sanitary pads', uses: 'Menstrual hygiene', kw: 'pad napkin period suvidha' },
    'mask':               { label: 'Face mask', uses: 'Protection from dust and infection', kw: 'mask' },
    'diaper':             { label: 'Adult diaper', uses: 'Incontinence care', kw: 'diaper' },
    'dressing':           { label: 'Dressing material', uses: 'Wound care, first aid', kw: 'bandage patti पट्टी first aid' },
    'thermometer':        { label: 'Thermometer', uses: 'Body temperature check', kw: 'fever temperature' }
  };

  // Hindi names for common salts (shown as a subtitle, and searchable in Hindi / voice search).
  var HINDI = {
    'Paracetamol': 'पैरासिटामोल', 'Ibuprofen': 'आइबुप्रोफेन', 'Diclofenac': 'डाइक्लोफेनाक',
    'Amoxicillin': 'एमोक्सिसिलिन', 'Azithromycin': 'एज़िथ्रोमाइसिन', 'Cefixime': 'सेफिक्सिम',
    'Ciprofloxacin': 'सिप्रोफ्लोक्सासिन', 'Metronidazole': 'मेट्रोनिडाजोल', 'Albendazole': 'एल्बेंडाजोल',
    'Metformin': 'मेटफॉर्मिन', 'Glimepiride': 'ग्लिमेपिराइड', 'Amlodipine': 'एम्लोडिपिन',
    'Telmisartan': 'टेल्मिसार्टन', 'Losartan': 'लोसार्टन', 'Atenolol': 'एटेनोलोल',
    'Atorvastatin': 'एटोरवास्टेटिन', 'Rosuvastatin': 'रोसुवास्टेटिन', 'Aspirin': 'एस्पिरिन',
    'Clopidogrel': 'क्लोपिडोग्रेल', 'Pantoprazole': 'पैंटोप्राज़ोल', 'Omeprazole': 'ओमेप्राज़ोल',
    'Rabeprazole': 'रैबेप्राज़ोल', 'Ondansetron': 'ओंडांसेट्रॉन', 'Domperidone': 'डोम्पेरिडोन',
    'Cetirizine': 'सेटिरिज़िन', 'Levocetirizine': 'लेवोसेटिरिज़िन', 'Montelukast': 'मोंटेलुकास्ट',
    'Vitamin D3': 'विटामिन डी3', 'Methylcobalamin': 'मिथाइलकोबालामिन', 'Folic Acid': 'फोलिक एसिड',
    'Vitamin C': 'विटामिन सी', 'Levothyroxine': 'लेवोथायरोक्सिन', 'Pregabalin': 'प्रीगैबलिन',
    'Clotrimazole': 'क्लोट्रिमाज़ोल', 'Oral Rehydration Salts': 'ओआरएस घोल'
  };

  /* eslint-disable max-len */
  var RAW = [
    // ---------- Pain & fever ----------
    ['m001', 'Paracetamol', '500 mg', 'Tablet', '10 tablets', 'pain', 'antipyretic', 9, false, 'Crocin 500:20|Calpol 500:15|Paracip 500:12|Pacimol 500:14'],
    ['m002', 'Paracetamol', '650 mg', 'Tablet', '10 tablets', 'pain', 'antipyretic', 12, false, 'Dolo 650:30|Calpol 650:25|Pacimol 650:22|Crocin 650:30'],
    ['m003', 'Paracetamol', '125 mg/5 ml', 'Syrup', '60 ml bottle', 'pain', 'antipyretic', 14, false, 'Calpol Syrup:38|Crocin Syrup:42|P-125 Syrup:30'],
    ['m004', 'Ibuprofen', '400 mg', 'Tablet', '10 tablets', 'pain', 'nsaid', 8, false, 'Brufen 400:18|Ibugesic 400:16'],
    ['m005', 'Ibuprofen + Paracetamol', '400 mg + 325 mg', 'Tablet', '10 tablets', 'pain', 'nsaid', 9, false, 'Combiflam:30|Ibugesic Plus:26'],
    ['m006', 'Diclofenac Sodium', '50 mg', 'Tablet', '10 tablets', 'pain', 'nsaid', 6, true, 'Voveran 50:40|Dynapar 50:30'],
    ['m007', 'Diclofenac', '1% w/w', 'Gel', '30 g tube', 'pain', 'topical-analgesic', 18, false, 'Volini Gel:120|Voveran Emulgel:130'],
    ['m008', 'Aceclofenac + Paracetamol', '100 mg + 325 mg', 'Tablet', '10 tablets', 'pain', 'nsaid', 11, true, 'Zerodol-P:65|Hifenac-P:60'],
    ['m009', 'Dicyclomine + Mefenamic Acid', '10 mg + 250 mg', 'Tablet', '10 tablets', 'pain', 'antispasmodic', 12, true, 'Meftal-Spas:48'],
    ['m010', 'Drotaverine', '40 mg', 'Tablet', '10 tablets', 'pain', 'antispasmodic', 8, true, 'Drotin 40:60|Doverin 40:55'],

    // ---------- Infections ----------
    ['m011', 'Amoxicillin', '500 mg', 'Capsule', '10 capsules', 'anti', 'penicillin', 22, true, 'Mox 500:95|Novamox 500:90'],
    ['m012', 'Amoxicillin + Clavulanic Acid', '500 mg + 125 mg', 'Tablet', '10 tablets', 'anti', 'penicillin', 55, true, 'Augmentin 625 Duo:200|Moxikind-CV 625:170|Clavam 625:185'],
    ['m013', 'Azithromycin', '500 mg', 'Tablet', '3 tablets', 'anti', 'macrolide', 25, true, 'Azithral 500:120|Azee 500:115|Zithrox 500:100'],
    ['m014', 'Cefixime', '200 mg', 'Tablet', '10 tablets', 'anti', 'cephalosporin', 30, true, 'Taxim-O 200:110|Zifi 200:100|Mahacef 200:95'],
    ['m015', 'Ciprofloxacin', '500 mg', 'Tablet', '10 tablets', 'anti', 'fluoroquinolone', 18, true, 'Ciplox 500:70|Cifran 500:65'],
    ['m016', 'Ofloxacin', '200 mg', 'Tablet', '10 tablets', 'anti', 'fluoroquinolone', 16, true, 'Zanocin 200:60|Oflox 200:58'],
    ['m017', 'Levofloxacin', '500 mg', 'Tablet', '10 tablets', 'anti', 'fluoroquinolone', 28, true, 'Levoflox 500:90|Glevo 500:85'],
    ['m018', 'Doxycycline', '100 mg', 'Capsule', '10 capsules', 'anti', 'tetracycline', 15, true, 'Doxt-SL:60|Microdox LBX:70'],
    ['m019', 'Metronidazole', '400 mg', 'Tablet', '10 tablets', 'anti', 'nitroimidazole', 7, true, 'Flagyl 400:25|Metrogyl 400:22'],
    ['m020', 'Albendazole', '400 mg', 'Tablet', '1 tablet', 'anti', 'anthelmintic', 3, false, 'Zentel:12|Bandy:10'],
    ['m021', 'Fluconazole', '150 mg', 'Tablet', '1 tablet', 'anti', 'antifungal-oral', 6, true, 'Forcan 150:20|Zocon 150:18'],
    ['m022', 'Sulfamethoxazole + Trimethoprim', '800 mg + 160 mg', 'Tablet', '10 tablets', 'anti', 'sulfonamide', 8, true, 'Septran DS:30|Bactrim DS:35'],
    ['m023', 'Acyclovir', '400 mg', 'Tablet', '10 tablets', 'anti', 'antiviral', 30, true, 'Zovirax 400:120|Acivir 400:90'],
    ['m024', 'Ivermectin', '12 mg', 'Tablet', '1 tablet', 'anti', 'anthelmintic', 8, true, 'Ivecop 12:25'],

    // ---------- Diabetes ----------
    ['m025', 'Metformin', '500 mg', 'Tablet', '10 tablets', 'diab', 'biguanide', 8, true, 'Glycomet 500:20|Gluformin 500:15|Obimet 500:14'],
    ['m026', 'Metformin', '1000 mg SR', 'Tablet', '10 tablets', 'diab', 'biguanide', 14, true, 'Glycomet SR 1000:38|Obimet SR 1000:35'],
    ['m027', 'Glimepiride', '1 mg', 'Tablet', '10 tablets', 'diab', 'sulfonylurea', 8, true, 'Amaryl 1:120|Glimestar 1:70|Glimy 1:45'],
    ['m028', 'Glimepiride', '2 mg', 'Tablet', '10 tablets', 'diab', 'sulfonylurea', 12, true, 'Amaryl 2:190|Glimestar 2:110|Glimy 2:70'],
    ['m029', 'Glimepiride + Metformin', '1 mg + 500 mg', 'Tablet', '10 tablets', 'diab', 'sulfonylurea-biguanide', 15, true, 'Glycomet-GP 1:95|Gemer 1:110|Glimestar-M1:90'],
    ['m030', 'Gliclazide', '80 mg', 'Tablet', '10 tablets', 'diab', 'sulfonylurea', 10, true, 'Diamicron 80:75|Reclide 80:60'],
    ['m031', 'Sitagliptin', '100 mg', 'Tablet', '10 tablets', 'diab', 'dpp4', 60, true, 'Januvia 100:380|Istavel 100:250'],
    ['m032', 'Vildagliptin', '50 mg', 'Tablet', '10 tablets', 'diab', 'dpp4', 40, true, 'Galvus 50:250|Jalra 50:200|Zomelis 50:180'],
    ['m033', 'Pioglitazone', '15 mg', 'Tablet', '10 tablets', 'diab', 'glitazone', 7, true, 'Pioz 15:45|Pioglit 15:40'],
    ['m034', 'Voglibose', '0.3 mg', 'Tablet', '10 tablets', 'diab', 'agi', 15, true, 'Volix 0.3:110'],
    ['m035', 'Dapagliflozin', '10 mg', 'Tablet', '10 tablets', 'diab', 'sglt2', 45, true, 'Forxiga 10:450|Oxra 10:280'],
    ['m036', 'Human Insulin Premix 30/70', '40 IU/ml', 'Injection', '10 ml vial', 'diab', 'insulin', 100, true, 'Huminsulin 30/70:170|Insugen 30/70:160|Wosulin 30/70:150'],

    // ---------- Heart & BP ----------
    ['m037', 'Amlodipine', '5 mg', 'Tablet', '10 tablets', 'heart', 'ccb', 5, true, 'Amlokind 5:25|Amlong 5:35|Stamlo 5:40'],
    ['m038', 'Amlodipine', '10 mg', 'Tablet', '10 tablets', 'heart', 'ccb', 8, true, 'Amlong 10:60|Stamlo 10:70'],
    ['m039', 'Telmisartan', '40 mg', 'Tablet', '10 tablets', 'heart', 'arb', 12, true, 'Telma 40:110|Telmikind 40:60|Telsartan 40:70'],
    ['m040', 'Telmisartan + Hydrochlorothiazide', '40 mg + 12.5 mg', 'Tablet', '10 tablets', 'heart', 'arb-combo', 16, true, 'Telma-H:140|Telmikind-H:80'],
    ['m041', 'Telmisartan + Amlodipine', '40 mg + 5 mg', 'Tablet', '10 tablets', 'heart', 'arb-combo', 16, true, 'Telma-AM:150|Telmikind-AM:85'],
    ['m042', 'Losartan', '50 mg', 'Tablet', '10 tablets', 'heart', 'arb', 9, true, 'Losar 50:60|Repace 50:65|Losacar 50:55'],
    ['m043', 'Olmesartan', '20 mg', 'Tablet', '10 tablets', 'heart', 'arb', 20, true, 'Olmezest 20:95|Olsar 20:110'],
    ['m044', 'Enalapril', '5 mg', 'Tablet', '10 tablets', 'heart', 'ace', 4, true, 'Envas 5:20|Enam 5:22'],
    ['m045', 'Ramipril', '5 mg', 'Tablet', '10 tablets', 'heart', 'ace', 10, true, 'Cardace 5:95|Ramistar 5:70'],
    ['m046', 'Atenolol', '50 mg', 'Tablet', '10 tablets', 'heart', 'beta-blocker', 4, true, 'Aten 50:22|Tenormin 50:30'],
    ['m047', 'Metoprolol Succinate', '50 mg ER', 'Tablet', '10 tablets', 'heart', 'beta-blocker', 15, true, 'Met XL 50:90|Metolar XR 50:85|Seloken XL 50:100'],
    ['m048', 'Bisoprolol', '5 mg', 'Tablet', '10 tablets', 'heart', 'beta-blocker', 12, true, 'Concor 5:130'],
    ['m049', 'Hydrochlorothiazide', '12.5 mg', 'Tablet', '10 tablets', 'heart', 'diuretic', 4, true, 'Aquazide 12.5:15'],
    ['m050', 'Furosemide', '40 mg', 'Tablet', '10 tablets', 'heart', 'diuretic', 3, true, 'Lasix 40:12'],
    ['m051', 'Spironolactone', '25 mg', 'Tablet', '10 tablets', 'heart', 'diuretic', 10, true, 'Aldactone 25:40'],
    ['m052', 'Atorvastatin', '10 mg', 'Tablet', '10 tablets', 'heart', 'statin', 8, true, 'Atorva 10:90|Lipitor 10:140|Storvas 10:80'],
    ['m053', 'Atorvastatin', '20 mg', 'Tablet', '10 tablets', 'heart', 'statin', 14, true, 'Atorva 20:160|Storvas 20:140|Tonact 20:120'],
    ['m054', 'Rosuvastatin', '10 mg', 'Tablet', '10 tablets', 'heart', 'statin', 15, true, 'Rosuvas 10:210|Crestor 10:280|Rozavel 10:190'],
    ['m055', 'Aspirin', '75 mg', 'Tablet', '14 tablets', 'heart', 'antiplatelet', 3, true, 'Ecosprin 75:5'],
    ['m056', 'Clopidogrel', '75 mg', 'Tablet', '10 tablets', 'heart', 'antiplatelet', 12, true, 'Clopilet 75:80|Plavix 75:190|Clavix 75:95'],
    ['m057', 'Aspirin + Clopidogrel', '75 mg + 75 mg', 'Capsule', '10 capsules', 'heart', 'antiplatelet', 14, true, 'Clopitab-A 75:70|Deplatt-A 75:75'],
    ['m058', 'Isosorbide Dinitrate', '5 mg', 'Tablet', '10 tablets', 'heart', 'nitrate', 3, true, 'Sorbitrate 5:12'],

    // ---------- Stomach & digestion ----------
    ['m059', 'Pantoprazole', '40 mg', 'Tablet', '10 tablets', 'gastro', 'ppi', 8, true, 'Pan 40:155|Pantocid 40:150|Pantop 40:120'],
    ['m060', 'Pantoprazole + Domperidone', '40 mg + 30 mg SR', 'Capsule', '10 capsules', 'gastro', 'ppi-prokinetic', 14, true, 'Pan-D:200|Pantocid-DSR:190'],
    ['m061', 'Omeprazole', '20 mg', 'Capsule', '10 capsules', 'gastro', 'ppi', 6, false, 'Omez 20:60|Ocid 20:50'],
    ['m062', 'Rabeprazole', '20 mg', 'Tablet', '10 tablets', 'gastro', 'ppi', 10, true, 'Razo 20:95|Rablet 20:90|Rabekind 20:60'],
    ['m063', 'Esomeprazole', '40 mg', 'Tablet', '10 tablets', 'gastro', 'ppi', 14, true, 'Nexpro 40:160|Esoz 40:150|Raciper 40:140'],
    ['m064', 'Famotidine', '20 mg', 'Tablet', '10 tablets', 'gastro', 'h2', 5, false, 'Famocid 20:20|Topcid 20:18'],
    ['m065', 'Ondansetron', '4 mg', 'Tablet', '10 tablets', 'gastro', 'antiemetic', 8, true, 'Emeset 4:40|Ondem 4:45|Vomikind 4:30'],
    ['m066', 'Domperidone', '10 mg', 'Tablet', '10 tablets', 'gastro', 'antiemetic', 5, true, 'Domstal 10:35|Vomistop 10:30'],
    ['m067', 'Oral Rehydration Salts', 'WHO formula 21.8 g', 'Sachet', '1 sachet', 'gastro', 'ors', 4, false, 'Electral:22'],
    ['m068', 'Lactulose', '10 g/15 ml', 'Solution', '100 ml bottle', 'gastro', 'laxative', 55, false, 'Duphalac:230|Looz:180'],
    ['m069', 'Bisacodyl', '5 mg', 'Tablet', '10 tablets', 'gastro', 'laxative', 3, false, 'Dulcolax:12'],
    ['m070', 'Loperamide', '2 mg', 'Tablet', '10 tablets', 'gastro', 'antidiarrheal', 3, false, 'Eldoper:14|Lopamide:12'],
    ['m071', 'Magaldrate + Simethicone', '480 mg + 20 mg /10 ml', 'Suspension', '170 ml bottle', 'gastro', 'antacid', 35, false, 'Digene Gel:130|Gelusil MPS:110'],
    ['m072', 'Ursodeoxycholic Acid', '300 mg', 'Tablet', '10 tablets', 'gastro', 'bile-acid', 45, true, 'Udiliv 300:420|Ursocol 300:380'],

    // ---------- Cough, cold & allergy ----------
    ['m073', 'Cetirizine', '10 mg', 'Tablet', '10 tablets', 'resp', 'antihistamine', 3, false, 'Cetzine 10:20|Okacet 10:18|Alerid 10:17'],
    ['m074', 'Levocetirizine', '5 mg', 'Tablet', '10 tablets', 'resp', 'antihistamine', 4, false, 'Levocet 5:40|Xyzal 5:65|Teczine 5:35'],
    ['m075', 'Fexofenadine', '120 mg', 'Tablet', '10 tablets', 'resp', 'antihistamine', 15, false, 'Allegra 120:190|Fexova 120:150'],
    ['m076', 'Montelukast + Levocetirizine', '10 mg + 5 mg', 'Tablet', '10 tablets', 'resp', 'leukotriene', 16, true, 'Montair-LC:180|Montek-LC:170|Telekast-L:150'],
    ['m077', 'Montelukast', '10 mg', 'Tablet', '10 tablets', 'resp', 'leukotriene', 12, true, 'Montair 10:170|Romilast 10:150'],
    ['m078', 'Salbutamol', '100 mcg/dose', 'Inhaler', '200 doses', 'resp', 'bronchodilator', 60, true, 'Asthalin Inhaler:150|Ventorlin Inhaler:160'],
    ['m079', 'Budesonide + Formoterol', '200 mcg + 6 mcg', 'Inhaler', '120 doses', 'resp', 'ics-laba', 180, true, 'Foracort 200 Inhaler:450|Budamate 200 Inhaler:400'],
    ['m080', 'Ambroxol', '30 mg/5 ml', 'Syrup', '100 ml bottle', 'resp', 'mucolytic', 20, false, 'Mucolite:75|Ambrodil:65'],
    ['m081', 'Paracetamol + Phenylephrine + Chlorpheniramine', '500 mg + 10 mg + 2 mg', 'Tablet', '10 tablets', 'resp', 'cold-combo', 8, false, 'Sinarest:55'],
    ['m082', 'Xylometazoline', '0.1%', 'Nasal Spray', '10 ml bottle', 'resp', 'decongestant', 25, false, 'Otrivin:120'],
    ['m083', 'Prednisolone', '10 mg', 'Tablet', '10 tablets', 'resp', 'corticosteroid', 6, true, 'Wysolone 10:18|Omnacortil 10:20'],
    ['m084', 'Deflazacort', '6 mg', 'Tablet', '10 tablets', 'resp', 'corticosteroid', 20, true, 'Defcort 6:90|Dezacor 6:95'],

    // ---------- Vitamins & supplements ----------
    ['m085', 'Vitamin D3 (Cholecalciferol)', '60,000 IU', 'Capsule', '4 capsules', 'vit', 'vitamin-d', 25, false, 'Uprise-D3 60K:130|D-Rise 60K:120'],
    ['m086', 'Calcium Carbonate + Vitamin D3', '500 mg + 250 IU', 'Tablet', '15 tablets', 'vit', 'calcium', 20, false, 'Shelcal 500:120|Cipcal 500:95'],
    ['m087', 'Methylcobalamin', '1500 mcg', 'Tablet', '10 tablets', 'vit', 'b12', 12, false, 'Nurokind 1500:110'],
    ['m088', 'Ferrous Ascorbate + Folic Acid', '100 mg + 1.5 mg', 'Tablet', '10 tablets', 'vit', 'iron', 15, false, 'Orofer XT:180|Ferium XT:170'],
    ['m089', 'Folic Acid', '5 mg', 'Tablet', '10 tablets', 'vit', 'folate', 2, false, 'Folvite 5:25'],
    ['m090', 'Multivitamin + Multimineral', 'Daily', 'Tablet', '15 tablets', 'vit', 'multivitamin', 25, false, 'Supradyn:55|A to Z NS:110'],
    ['m091', 'Vitamin B-Complex', 'Forte', 'Capsule', '10 capsules', 'vit', 'b-complex', 8, false, 'Becosules:45|Neurobion Forte:35'],
    ['m092', 'Vitamin C (Ascorbic Acid)', '500 mg', 'Chewable Tablet', '15 tablets', 'vit', 'vitamin-c', 10, false, 'Limcee:25|Celin 500:20'],

    // ---------- Skin ----------
    ['m093', 'Clotrimazole', '1% w/w', 'Cream', '15 g tube', 'skin', 'antifungal-topical', 12, false, 'Candid Cream:75|Clocip Cream:60'],
    ['m094', 'Luliconazole', '1% w/w', 'Cream', '10 g tube', 'skin', 'antifungal-topical', 45, true, 'Lulifin Cream:190'],
    ['m095', 'Mupirocin', '2% w/w', 'Ointment', '5 g tube', 'skin', 'antibacterial-topical', 35, true, 'T-Bact:130|Bactroban:160'],
    ['m096', 'Fusidic Acid', '2% w/w', 'Cream', '10 g tube', 'skin', 'antibacterial-topical', 30, true, 'Fucidin:150|Fusiderm:110'],
    ['m097', 'Betamethasone Valerate', '0.1% w/w', 'Cream', '20 g tube', 'skin', 'steroid-topical', 12, true, 'Betnovate Cream:40'],
    ['m098', 'Permethrin', '5% w/w', 'Cream', '30 g tube', 'skin', 'scabicide', 35, true, 'Permite Cream:130'],
    ['m099', 'Calamine', '8% w/v', 'Lotion', '100 ml bottle', 'skin', 'soothing', 25, false, 'Caladryl:110'],
    ['m100', 'Silver Sulfadiazine', '1% w/w', 'Cream', '25 g tube', 'skin', 'burn', 20, true, 'Silverex:80'],

    // ---------- Brain & nerves ----------
    ['m101', 'Pregabalin', '75 mg', 'Capsule', '10 capsules', 'neuro', 'neuropathic', 20, true, 'Lyrica 75:350|Pregeb 75:190'],
    ['m102', 'Pregabalin + Methylcobalamin', '75 mg + 750 mcg', 'Capsule', '10 capsules', 'neuro', 'neuropathic', 25, true, 'Pregeb M 75:220|Maxgalin M 75:210'],
    ['m103', 'Levetiracetam', '500 mg', 'Tablet', '10 tablets', 'neuro', 'antiepileptic', 25, true, 'Levipil 500:180|Levera 500:170'],
    ['m104', 'Sodium Valproate', '200 mg', 'Tablet', '10 tablets', 'neuro', 'antiepileptic', 10, true, 'Valparin 200:50|Encorate 200:45'],
    ['m105', 'Escitalopram', '10 mg', 'Tablet', '10 tablets', 'neuro', 'ssri', 12, true, 'Nexito 10:130|Cipralex 10:190|S Citadep 10:110'],
    ['m106', 'Sertraline', '50 mg', 'Tablet', '10 tablets', 'neuro', 'ssri', 12, true, 'Serta 50:95|Daxid 50:110'],
    ['m107', 'Amitriptyline', '10 mg', 'Tablet', '10 tablets', 'neuro', 'tca', 4, true, 'Tryptomer 10:25'],
    ['m108', 'Betahistine', '16 mg', 'Tablet', '10 tablets', 'neuro', 'antivertigo', 20, true, 'Vertin 16:190|Betavert 16:170'],
    ['m109', 'Flunarizine', '10 mg', 'Tablet', '10 tablets', 'neuro', 'migraine', 10, true, 'Sibelium 10:80'],

    // ---------- Thyroid & hormones ----------
    ['m110', 'Levothyroxine', '25 mcg', 'Tablet', '100 tablets', 'hormone', 'thyroid', 60, true, 'Thyronorm 25:150|Eltroxin 25:140|Thyrox 25:130'],
    ['m111', 'Levothyroxine', '50 mcg', 'Tablet', '100 tablets', 'hormone', 'thyroid', 70, true, 'Thyronorm 50:180|Eltroxin 50:170|Thyrox 50:160'],
    ['m112', 'Levothyroxine', '100 mcg', 'Tablet', '100 tablets', 'hormone', 'thyroid', 80, true, 'Thyronorm 100:220|Eltroxin 100:200'],
    ['m113', 'Carbimazole', '5 mg', 'Tablet', '30 tablets', 'hormone', 'antithyroid', 20, true, 'Neo-Mercazole 5:60'],
    ['m114', 'Tamsulosin', '0.4 mg', 'Capsule', '10 capsules', 'hormone', 'alpha-blocker', 25, true, 'Urimax 0.4:170|Contiflo OD 0.4:160'],

    // ---------- Eye & ear ----------
    ['m115', 'Carboxymethylcellulose', '0.5% w/v', 'Eye Drops', '10 ml bottle', 'eye', 'eye-lubricant', 40, false, 'Refresh Tears:150'],
    ['m116', 'Ciprofloxacin', '0.3% w/v', 'Eye/Ear Drops', '5 ml bottle', 'eye', 'eye-antibiotic', 8, true, 'Ciplox Eye Drops:20'],
    ['m117', 'Moxifloxacin', '0.5% w/v', 'Eye Drops', '5 ml bottle', 'eye', 'eye-antibiotic', 25, true, 'Vigamox:180|Moxicip:90'],

    // ---------- Surgicals & devices ----------
    ['m118', 'Glucometer', '', 'Device', '1 meter + 10 strips', 'surg', 'glucometer', 350, false, 'Accu-Chek Active:1200|OneTouch Select Plus Simple:1100|Dr Morepen BG-03:800', 'Glucometer (with 10 strips)', 0.45],
    ['m119', 'Blood Glucose Test Strips', '', 'Strips', '50 strips', 'surg', 'glucose-strips', 400, false, 'Accu-Chek Active Strips:950|OneTouch Select Plus Strips:1000|Dr Morepen BG-03 Strips:650', 'Blood Glucose Test Strips (pack of 50)', 0.6],
    ['m120', 'Suvidha Sanitary Napkin', 'Oxo-biodegradable', 'Pad', '4 pads', 'surg', 'sanitary', 4, false, 'Whisper Choice:24|Stayfree Secure:20', 'Suvidha Sanitary Napkin (pack of 4)'],
    ['m121', 'N95 Face Mask', '', 'Mask', '1 mask', 'surg', 'mask', 12, false, '', 'N95 Face Mask'],
    ['m122', 'Adult Diaper', 'Medium', 'Diaper', '10 pieces', 'surg', 'diaper', 180, false, 'Friends Adult Diaper M:450', 'Adult Diaper, Medium (pack of 10)'],
    ['m123', 'Absorbent Cotton Wool', '100 g', 'Roll', '1 roll', 'surg', 'dressing', 25, false, '', 'Absorbent Cotton Wool 100 g'],
    ['m124', 'Roller Bandage', '10 cm x 3 m', 'Bandage', '1 roll', 'surg', 'dressing', 10, false, '', 'Roller Bandage 10 cm x 3 m'],
    ['m125', 'Digital Thermometer', '', 'Device', '1 piece', 'surg', 'thermometer', 70, false, 'Dr Trust Digital Thermometer:250|Omron MC-246:230', 'Digital Thermometer']
  ];
  /* eslint-enable max-len */

  function parseBrands(str) {
    if (!str) return [];
    return str.split('|').map(function (part) {
      var i = part.lastIndexOf(':');
      return { name: part.slice(0, i), price: Number(part.slice(i + 1)) };
    });
  }

  var MEDICINES = RAW.map(function (r) {
    var name = r[10] || [r[1], r[2], r[3]].filter(Boolean).join(' ');
    var hiSalt = r[1].split(' + ').map(function (s) { return HINDI[s] || null; });
    return {
      id: r[0],
      salt: r[1],
      strength: r[2],
      form: r[3],
      pack: r[4],
      category: r[5],
      cls: r[6],
      price: r[7],
      rx: r[8],
      brands: parseBrands(r[9]),
      name: name,
      nameHi: hiSalt.every(Boolean) ? hiSalt.join(' + ') : '',
      availability: r[11] || 1
    };
  });

  return {
    version: '2026.09.20',
    updatedAt: '2026-09-20T06:00:00+05:30',
    categories: CATEGORIES,
    classes: CLASSES,
    medicines: MEDICINES
  };
});
