/*
 * SAMPLE Janaushadhi Kendra list for the prototype.
 *
 * Locations are approximate area centres, shop numbers are made up and phone
 * numbers are placeholders (0000...). A real build would load the official
 * Kendra list from the PMBI API and let Kendras update their own status.
 *
 * Row format:
 *   [id, area, city, lat, lng, opens, closes, status, verified (days ago), stock level 0-1]
 *   status: 'active' | 'closed' (permanently closed, hidden by default)
 */
(function (factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { window.JA = window.JA || {}; window.JA.kendras = data; }
})(function () {
  'use strict';

  var CITIES = [
    { id: 'delhi',     name: 'New Delhi',  lat: 28.6139, lng: 77.2090 },
    { id: 'gurugram',  name: 'Gurugram',   lat: 28.4595, lng: 77.0266 },
    { id: 'noida',     name: 'Noida',      lat: 28.5355, lng: 77.3910 },
    { id: 'mumbai',    name: 'Mumbai',     lat: 19.0760, lng: 72.8777 },
    { id: 'pune',      name: 'Pune',       lat: 18.5204, lng: 73.8567 },
    { id: 'bengaluru', name: 'Bengaluru',  lat: 12.9716, lng: 77.5946 },
    { id: 'lucknow',   name: 'Lucknow',    lat: 26.8467, lng: 80.9462 },
    { id: 'patna',     name: 'Patna',      lat: 25.5941, lng: 85.1376 },
    { id: 'jaipur',    name: 'Jaipur',     lat: 26.9124, lng: 75.7873 },
    { id: 'kolkata',   name: 'Kolkata',    lat: 22.5726, lng: 88.3639 },
    { id: 'chennai',   name: 'Chennai',    lat: 13.0827, lng: 80.2707 },
    { id: 'hyderabad', name: 'Hyderabad',  lat: 17.3850, lng: 78.4867 },
    { id: 'ludhiana',  name: 'Ludhiana',   lat: 30.9010, lng: 75.8573 },
    { id: 'haldwani',  name: 'Haldwani',   lat: 29.2183, lng: 79.5130 }
  ];

  var RAW = [
    ['k01', 'Connaught Place',        'New Delhi', 28.6315, 77.2167, '08:00', '21:00', 'active', 3,   0.92],
    ['k02', 'Karol Bagh',             'New Delhi', 28.6519, 77.1909, '09:00', '21:00', 'active', 12,  0.85],
    ['k03', 'Lajpat Nagar',           'New Delhi', 28.5677, 77.2433, '08:30', '20:30', 'active', 6,   0.88],
    ['k04', 'Dwarka Sector 10',       'New Delhi', 28.5812, 77.0590, '09:00', '20:00', 'active', 20,  0.8],
    ['k05', 'Rohini Sector 7',        'New Delhi', 28.7159, 77.1130, '09:00', '21:00', 'active', 9,   0.82],
    ['k06', 'Mayur Vihar Phase 1',    'New Delhi', 28.6046, 77.2947, '08:00', '20:00', 'active', 15,  0.78],
    ['k07', 'AIIMS Campus',           'New Delhi', 28.5672, 77.2100, '00:00', '23:59', 'active', 1,   0.95],
    ['k08', 'Sector 14 Market',       'Gurugram',  28.4722, 77.0430, '09:00', '21:00', 'active', 7,   0.84],
    ['k09', 'DLF Phase 3',            'Gurugram',  28.4935, 77.0930, '09:00', '20:00', 'closed', 365, 0],
    ['k10', 'Sector 18',              'Noida',     28.5700, 77.3210, '09:00', '21:00', 'active', 4,   0.86],
    ['k11', 'Dadar West',             'Mumbai',    19.0178, 72.8478, '08:00', '22:00', 'active', 2,   0.9],
    ['k12', 'Andheri East',           'Mumbai',    19.1136, 72.8697, '09:00', '21:00', 'active', 11,  0.83],
    ['k13', 'Kurla West',             'Mumbai',    19.0726, 72.8845, '09:00', '21:00', 'active', 30,  0.7],
    ['k14', 'Thane Station Road',     'Mumbai',    19.1860, 72.9750, '09:00', '21:00', 'active', 8,   0.81],
    ['k15', 'Shivajinagar',           'Pune',      18.5308, 73.8475, '09:00', '21:00', 'active', 5,   0.87],
    ['k16', 'Kothrud',                'Pune',      18.5074, 73.8077, '09:00', '21:00', 'active', 14,  0.8],
    ['k17', 'Hadapsar',               'Pune',      18.5089, 73.9260, '09:30', '20:30', 'active', 21,  0.76],
    ['k18', 'Jayanagar 4th Block',    'Bengaluru', 12.9250, 77.5938, '09:00', '21:00', 'active', 3,   0.9],
    ['k19', 'Malleshwaram',           'Bengaluru', 13.0035, 77.5709, '09:00', '21:00', 'active', 10,  0.85],
    ['k20', 'Whitefield',             'Bengaluru', 12.9698, 77.7500, '09:00', '21:00', 'active', 18,  0.79],
    ['k21', 'Hazratganj',             'Lucknow',   26.8500, 80.9460, '09:00', '21:00', 'active', 6,   0.84],
    ['k22', 'Aliganj',                'Lucknow',   26.8910, 80.9420, '09:00', '20:00', 'active', 16,  0.77],
    ['k23', 'Gomti Nagar',            'Lucknow',   26.8560, 81.0040, '09:00', '21:00', 'active', 9,   0.83],
    ['k24', 'Boring Road',            'Patna',     25.6160, 85.1150, '09:00', '21:00', 'active', 13,  0.8],
    ['k25', 'Kankarbagh',             'Patna',     25.5950, 85.1560, '09:00', '20:00', 'active', 25,  0.72],
    ['k26', 'C-Scheme',               'Jaipur',    26.9110, 75.8010, '09:00', '21:00', 'active', 4,   0.88],
    ['k27', 'Mansarovar',             'Jaipur',    26.8520, 75.7640, '09:00', '21:00', 'active', 17,  0.8],
    ['k28', 'Salt Lake Sector V',     'Kolkata',   22.5860, 88.4170, '09:00', '21:00', 'active', 8,   0.83],
    ['k29', 'Gariahat',               'Kolkata',   22.5190, 88.3660, '09:00', '21:00', 'active', 12,  0.82],
    ['k30', 'T. Nagar',               'Chennai',   13.0418, 80.2341, '09:00', '21:00', 'active', 5,   0.86],
    ['k31', 'Anna Nagar',             'Chennai',   13.0850, 80.2101, '09:00', '21:00', 'active', 19,  0.8],
    ['k32', 'Ameerpet',               'Hyderabad', 17.4375, 78.4482, '09:00', '21:00', 'active', 7,   0.85],
    ['k33', 'Secunderabad',           'Hyderabad', 17.4399, 78.4983, '09:00', '21:00', 'active', 22,  0.78],
    ['k34', 'Civil Hospital',         'Ludhiana',  30.9000, 75.8530, '10:00', '16:00', 'active', 2,   0.18],
    ['k35', 'Model Town',             'Ludhiana',  30.8880, 75.8400, '09:00', '21:00', 'active', 11,  0.8],
    ['k36', 'Nainital Road',          'Haldwani',  29.2250, 79.5160, '09:00', '20:00', 'active', 6,   0.82],
    ['k37', 'Kaladhungi Chauraha',    'Haldwani',  29.2100, 79.5050, '09:00', '20:00', 'active', 10,  0.8]
  ];

  // Small deterministic hash so the "shop number" stays the same on every load.
  function shopNo(id) {
    var n = 0;
    for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 97;
    return n + 1;
  }

  var KENDRAS = RAW.map(function (r) {
    var digits = r[0].replace(/\D/g, '');
    return {
      id: r[0],
      name: 'Janaushadhi Kendra, ' + r[1],
      area: r[1],
      city: r[2],
      address: 'Shop No. ' + shopNo(r[0]) + ', Main Market, ' + r[1] + ', ' + r[2],
      lat: r[3],
      lng: r[4],
      opens: r[5],
      closes: r[6],
      status: r[7],
      verifiedDaysAgo: r[8],
      stockLevel: r[9],
      phone: '+91 00000 000' + digits // placeholder, not a real number
    };
  });

  return { cities: CITIES, kendras: KENDRAS };
});
