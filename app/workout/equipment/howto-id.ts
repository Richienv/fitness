// "Cara pakai" for each machine in lib/equipment.ts, in Bahasa Indonesia, as
// short steps the way you would read them standing at the machine. The English
// text in lib/equipment.ts stays the source; this is its translation, keyed by
// the same id. A machine without an entry here falls back to the English text.

export type HowTo = {
  /** What to do, in order. */
  steps: string[];
  /** The one mistake to avoid. */
  avoid?: string;
};

export const HOWTO_ID: Record<string, HowTo> = {
  "chest-press-machine": {
    steps: [
      "Atur kursi supaya pegangan setinggi tengah dada. Duduk bersandar, tulang belikat menempel, kaki rata di lantai.",
      "Dorong pegangan ke depan sampai lengan hampir lurus (siku jangan dikunci).",
      "Kembalikan pelan sampai dada terasa teregang ringan.",
    ],
    avoid: "Punggung terangkat dari sandaran.",
  },
  "pec-deck": {
    steps: [
      "Atur kursi supaya pegangan setinggi dada dan lengan bawah menempel di bantalan.",
      "Duduk bersandar dengan tulang belikat menempel, lalu rapatkan bantalan di depan dada memakai otot dada.",
      "Tahan sebentar, lalu buka pelan sampai dada teregang nyaman.",
    ],
    avoid: "Membiarkan beban menyentak lenganmu ke belakang. Siku tetap sedikit menekuk.",
  },
  "cable-chest-fly": {
    steps: [
      "Pasang kedua katrol setinggi dada, pegang satu gagang di tiap tangan, satu kaki di depan untuk keseimbangan.",
      "Dengan siku sedikit menekuk dan tetap, ayunkan kedua tangan ke depan dada dalam busur lebar, lalu remas.",
      "Kembali pelan sampai dada teregang.",
    ],
    avoid: "Bahu maju ke depan. Bayangkan memeluk, bukan mendorong.",
  },
  "incline-chest-press-machine": {
    steps: [
      "Atur kursi supaya pegangan sejajar dada bagian atas. Duduk bersandar, tulang belikat menempel, kaki rata.",
      "Dorong pegangan ke atas dan depan sampai lengan hampir lurus.",
      "Turunkan pelan sampai dada teregang ringan.",
    ],
    avoid: "Mengunci siku keras di atas atau mengangkat punggung dari sandaran.",
  },
  "flat-bench-press": {
    steps: [
      "Berbaring datar dengan mata tepat di bawah barbel, kaki menapak, tulang belikat dirapatkan ke belakang.",
      "Pegang sedikit lebih lebar dari bahu, angkat dari rak, turunkan ke tengah dada dengan siku sekitar 45° dari badan.",
      "Dorong ke atas dan sedikit ke belakang, tepat di atas bahu.",
    ],
    avoid: "Memantulkan barbel dari dada. Pakai pendamping untuk beban berat.",
  },
  "incline-dumbbell-press": {
    steps: [
      "Atur bangku sekitar 30°. Duduk bersandar dengan satu dumbel di tiap tangan setinggi dada atas, telapak menghadap depan.",
      "Dorong ke atas dan sedikit merapat sampai lengan hampir lurus.",
      "Turunkan terkontrol sampai dada teregang.",
    ],
    avoid: "Membenturkan kedua dumbel di atas. Tulang belikat tetap dirapatkan.",
  },
  "lat-pulldown-machine": {
    steps: [
      "Kunci paha di bawah bantalan, pegang batang sedikit lebih lebar dari bahu.",
      "Condongkan badan sedikit ke belakang, tarik batang ke dada atas dengan menurunkan siku dan meremas otot punggung.",
      "Naikkan terkontrol sampai punggung teregang penuh.",
    ],
    avoid: "Menarik dengan lengan atau mengayun badan. Tarik dengan punggung.",
  },
  "seated-row-machine": {
    steps: [
      "Dada menempel di bantalan, kaki menapak, pegang gagang dengan lengan lurus.",
      "Tarik siku lurus ke belakang sambil merapatkan tulang belikat.",
      "Luruskan lengan pelan sampai punggung teregang.",
    ],
    avoid: "Badan ikut mengayun. Biarkan punggung yang bekerja, bukan momentum.",
  },
  "cable-lat-pulldown": {
    steps: [
      "Pegang batang sedikit lebih lebar dari bahu dan kunci paha di bawah bantalan.",
      "Condong sedikit ke belakang, tarik batang ke dada atas dengan menurunkan siku dan meremas punggung.",
      "Naikkan terkontrol sampai teregang penuh.",
    ],
    avoid: "Menarik dengan lengan atau mengayun.",
  },
  "cable-seated-row": {
    steps: [
      "Duduk dengan kaki bertumpu dan lutut sedikit menekuk. Pegang gagang dengan lengan lurus dan punggung tegak.",
      "Tarik siku ke belakang sambil merapatkan tulang belikat.",
      "Luruskan lengan pelan ke depan sampai teregang.",
    ],
    avoid: "Menyentak dengan punggung bawah. Badan tetap tegak dan diam.",
  },
  "t-bar-row": {
    steps: [
      "Berdiri mengangkangi batang, tekuk pinggul dengan punggung rata dan lutut sedikit menekuk, lalu pegang gagang.",
      "Tarik beban ke perut atas dengan mendorong siku ke belakang dan meremas punggung.",
      "Turunkan terkontrol.",
    ],
    avoid: "Punggung membulat atau badan terangkat memakai kaki. Dada tetap terangkat.",
  },
  "assisted-pullup-machine": {
    steps: [
      "Atur beban bantuan (makin berat, makin dibantu). Berlutut atau berdiri di bantalan, pegang batang lebih lebar dari bahu.",
      "Tarik naik sampai dagu melewati batang dengan menurunkan siku.",
      "Turunkan pelan sampai menggantung penuh.",
    ],
    avoid: "Mengayun badan. Kurangi bantuan seiring kamu makin kuat.",
  },
  "back-extension-machine": {
    steps: [
      "Atur bantalan di punggung atas dan tapakkan kaki.",
      "Dorong ke belakang sampai badan sejajar dengan pinggul sambil meremas punggung bawah dan bokong.",
      "Kembali pelan.",
    ],
    avoid: "Melengkung berlebihan melewati posisi lurus. Gerak terkontrol saja.",
  },
  "hyperextension-bench": {
    steps: [
      "Atur bantalan tepat di bawah pinggul dan kaitkan kaki. Lipat tangan di dada atau taruh di pelipis.",
      "Tekuk dari pinggul dengan punggung rata, lalu angkat badan sampai sejajar kaki sambil meremas bokong dan punggung bawah.",
      "Gerak halus, jangan mengayun.",
    ],
    avoid: "Melengkung melewati posisi lurus.",
  },
  "shoulder-press-machine": {
    steps: [
      "Atur kursi supaya pegangan mulai dekat setinggi bahu. Duduk tegak, punggung menempel.",
      "Dorong lurus ke atas sampai lengan hampir lurus, lalu turunkan terkontrol sampai sekitar setinggi telinga.",
    ],
    avoid: "Mengangkat bahu ke arah telinga saat mendorong.",
  },
  "lateral-raise-machine": {
    steps: [
      "Atur kursi supaya bantalan menempel di lengan luar, tepat di atas siku. Duduk tegak.",
      "Angkat kedua lengan ke samping sampai setinggi bahu, siku yang memimpin, lalu turunkan pelan.",
    ],
    avoid: "Mengangkat bahu atau memakai momentum. Biarkan bahu samping yang bekerja.",
  },
  "rear-delt-fly-machine": {
    steps: [
      "Duduk menghadap bantalan dengan dada menempel, pegang gagang dengan lengan lurus ke depan.",
      "Tarik gagang ke samping dan belakang dalam busur lebar sambil meremas tulang belikat.",
      "Kembali pelan.",
    ],
    avoid: "Menyentak dengan lengan. Siku sedikit menekuk dan memimpin gerakan.",
  },
  "cable-lateral-raise": {
    steps: [
      "Pasang katrol paling bawah, berdiri menyamping, pegang gagang dengan tangan terluar menyilang di depan badan.",
      "Angkat lengan ke samping sampai setinggi bahu dengan siku sedikit menekuk, lalu turunkan pelan melawan tarikan kabel.",
    ],
    avoid: "Badan mengayun. Siku yang memimpin.",
  },
  "cable-face-pull": {
    steps: [
      "Pasang tali setinggi kepala. Pegang kedua ujungnya dengan telapak saling menghadap, mundur sampai kabel menegang.",
      "Tarik tali ke arah wajah sambil memisahkan kedua tangan, siku tinggi dan ke belakang. Remas bahu belakang.",
      "Luruskan pelan.",
    ],
    avoid: "Menarik ke dada. Lengan atas tetap sejajar lantai: tarik sambil dipisah.",
  },
  "dumbbell-lateral-raise": {
    steps: [
      "Berdiri dengan satu dumbel di tiap tangan di sisi badan, siku sedikit menekuk.",
      "Angkat lengan ke samping sampai setinggi bahu, siku memimpin, lalu turunkan pelan.",
    ],
    avoid: "Mengayun atau mengangkat bahu. Jaga tegangan di bahu samping.",
  },
  "preacher-curl-machine": {
    steps: [
      "Atur kursi supaya lengan atas rata di bantalan miring, ketiak dekat bagian atas.",
      "Pegang gagang dan tekuk ke atas sambil meremas bisep.",
      "Turunkan pelan sampai hampir lurus.",
    ],
    avoid: "Lengan atas lepas dari bantalan atau siku tersentak di bawah.",
  },
  "cable-bicep-curl": {
    steps: [
      "Pasang katrol di bawah dan pasang batang atau gagang. Berdiri tegak, siku merapat di sisi badan.",
      "Tekuk ke atas sambil meremas bisep, lengan atas diam.",
      "Turunkan pelan melawan kabel.",
    ],
    avoid: "Mengayun badan atau membiarkan siku maju.",
  },
  "dumbbell-bicep-curl": {
    steps: [
      "Berdiri atau duduk dengan satu dumbel di tiap tangan, lengan di sisi badan, telapak menghadap depan.",
      "Tekuk siku, angkat dumbel sambil meremas bisep, lengan atas diam.",
      "Turunkan pelan.",
    ],
    avoid: "Mengayun. Kendalikan naik dan turun.",
  },
  "barbell-curl": {
    steps: [
      "Berdiri memegang barbel dengan genggaman bawah selebar bahu, siku di sisi badan.",
      "Tekuk ke atas sambil meremas bisep, lengan atas diam.",
      "Turunkan pelan sampai hampir lurus.",
    ],
    avoid: "Badan bergoyang atau barbel diayun naik. Biarkan bisep yang bekerja.",
  },
  "hammer-curl": {
    steps: [
      "Berdiri dengan satu dumbel di tiap tangan, telapak saling menghadap (ibu jari ke atas).",
      "Tekuk ke atas dengan genggaman netral itu sambil meremas bisep dan lengan bawah.",
      "Turunkan pelan.",
    ],
    avoid: "Mengayun. Siku merapat dan diam.",
  },
  "tricep-pushdown": {
    steps: [
      "Pasang batang atau tali di katrol atas. Berdiri tegak, siku merapat di sisi badan.",
      "Dorong ke bawah sampai lengan lurus sambil meremas trisep.",
      "Kembalikan pelan sampai sekitar 90°.",
    ],
    avoid: "Siku melebar. Hanya lengan bawah yang bergerak.",
  },
  "overhead-tricep-extension": {
    steps: [
      "Berdiri membelakangi katrol memegang tali, lengan di atas kepala dan siku menekuk.",
      "Luruskan lengan ke depan dan atas dengan meremas trisep, lengan atas tetap di samping kepala.",
      "Turunkan pelan sampai teregang di belakang kepala.",
    ],
    avoid: "Siku melebar. Arahkan siku ke depan.",
  },
  "tricep-dip-machine": {
    steps: [
      "Atur kursi dan pegang gagang dengan lengan menekuk.",
      "Dorong ke bawah sampai lengan hampir lurus sambil meremas trisep.",
      "Kembali pelan sampai teregang.",
    ],
    avoid: "Bahu naik atau siku dikunci keras di bawah. Badan tetap tegak.",
  },
  "skull-crusher": {
    steps: [
      "Berbaring di bangku datar memegang batang EZ atau barbel dengan lengan lurus di atas dada.",
      "Tekuk siku untuk menurunkan batang ke arah dahi, lengan atas diam.",
      "Luruskan lagi sambil meremas trisep.",
    ],
    avoid: "Siku melebar atau beban terlalu berat. Gerak pelan, siku menunjuk ke atas.",
  },
  "hack-squat-machine": {
    steps: [
      "Taruh bahu di bawah bantalan, kaki selebar bahu di pijakan, punggung rata menempel.",
      "Buka pengaman, lalu turun dengan menekuk lutut sampai sekitar 90°, tumit menapak dan lutut searah jari kaki.",
      "Dorong naik lewat tumit tanpa mengunci lutut keras.",
    ],
    avoid: "Punggung atau pinggul terangkat dari bantalan.",
  },
  "reverse-hack-squat": {
    steps: [
      "Hadap bantalan dengan dada dan bahu menempel, kaki di pijakan.",
      "Turun ke posisi squat dengan mendorong pinggul ke belakang dan menekuk lutut, dada tetap di bantalan.",
      "Dorong naik lewat tumit. Bagus untuk bokong.",
    ],
    avoid: "Lutut ke dalam atau punggung membulat. Lutut searah jari kaki.",
  },
  "leg-press-machine": {
    steps: [
      "Kaki selebar bahu di pijakan, punggung dan pinggul rata di bantalan.",
      "Buka pengaman, turunkan dengan menekuk lutut sampai sekitar 90° (lutut searah jari kaki).",
      "Dorong naik lewat tumit dan berhenti sebelum lutut terkunci.",
    ],
    avoid: "Punggung bawah membulat dan terangkat dari bantalan.",
  },
  "leg-extension-machine": {
    steps: [
      "Duduk bersandar dengan bantalan di tulang kering bawah, lutut di tepi kursi.",
      "Luruskan kaki sampai hampir lurus, remas paha depan di atas.",
      "Turunkan pelan.",
    ],
    avoid: "Menendang cepat atau menjatuhkan beban. Kendalikan naik dan turun.",
  },
  "seated-leg-curl": {
    steps: [
      "Duduk bersandar, bantalan di belakang betis bawah dan bantalan paha terkunci di atas kaki.",
      "Tekuk tumit ke bawah dan belakang ke arah bokong sambil meremas paha belakang.",
      "Kembali pelan.",
    ],
    avoid: "Paha terangkat atau punggung melengkung. Halus dan terkontrol.",
  },
  "lying-leg-curl": {
    steps: [
      "Tengkurap dengan bantalan di betis bawah dan pinggul rata di bantalan.",
      "Tekuk tumit ke arah bokong sambil meremas paha belakang.",
      "Turunkan pelan.",
    ],
    avoid: "Pinggul terangkat untuk membantu mengangkat beban.",
  },
  "hip-adductor-machine": {
    steps: [
      "Duduk dengan kaki di LUAR bantalan, lutut terbuka.",
      "Rapatkan lutut melawan beban, tahan sebentar.",
      "Buka pelan sampai teregang nyaman.",
    ],
    avoid: "Membiarkan beban terbuka menyentak. Punggung tetap di sandaran.",
  },
  "hip-abductor-machine": {
    steps: [
      "Duduk dengan kaki di DALAM bantalan, lutut rapat.",
      "Dorong lutut ke samping melawan beban sejauh nyaman, tahan sebentar.",
      "Kembali pelan.",
    ],
    avoid: "Bersandar miring. Duduk tegak dan gerak halus.",
  },
  "glute-kickback-machine": {
    steps: [
      "Tahan badan di bantalan dan taruh satu kaki di tuas.",
      "Dorong tuas ke belakang dan atas lewat tumit sambil meremas bokong.",
      "Kembalikan pelan.",
    ],
    avoid: "Punggung bawah melengkung berlebihan. Gerak datang dari pinggul, lutut sedikit menekuk.",
  },
  "calf-raise-machine": {
    steps: [
      "Taruh bagian depan telapak kaki di pijakan, tumit menggantung. Beban di bantalan atau bahu.",
      "Naik ke ujung jari sejauh mungkin sambil meremas betis.",
      "Turunkan pelan sampai betis teregang dalam, di bawah pijakan.",
    ],
    avoid: "Memantul. Rentang penuh dengan jeda di atas lebih baik.",
  },
  "smith-machine-squat": {
    steps: [
      "Taruh batang di punggung atas dan lepas dari pengait dengan memutarnya.",
      "Kaki selebar bahu, sedikit di depan batang. Squat sampai paha sekitar sejajar lantai, dada terangkat.",
      "Dorong naik lewat tumit. Kembalikan batang dengan memutarnya ke pengait.",
    ],
    avoid: "Punggung membulat. Punggung tetap netral sepanjang gerakan.",
  },
  "ab-crunch-machine": {
    steps: [
      "Atur kursi, pegang gagang atau bantalan bahu.",
      "Lengkungkan tulang rusuk ke arah pinggul memakai perut, hembuskan napas saat crunch.",
      "Kembali pelan dan jaga tegangan di perut sepanjang set.",
    ],
    avoid: "Menarik dengan lengan. Perut yang bekerja.",
  },
  "cable-crunch": {
    steps: [
      "Berlutut di bawah katrol atas memegang tali di sisi kepala.",
      "Crunch ke bawah dengan melengkungkan tulang rusuk ke pinggul memakai perut, punggung atas membulat.",
      "Kembali pelan.",
    ],
    avoid: "Pinggul bergerak atau hanya menarik dengan lengan. Menekuk dari pinggang.",
  },
  "roman-chair-situp": {
    steps: [
      "Kunci kaki dan taruh pinggul di bantalan.",
      "Turunkan badan ke belakang sampai hampir sejajar kaki, lalu bangkit lagi dengan mengencangkan perut.",
      "Tangan menyilang di dada lebih mudah, di belakang kepala lebih berat.",
    ],
    avoid: "Menjatuhkan badan ke belakang atau menyentak naik. Gerak terkontrol.",
  },
  "captains-chair-leg-raise": {
    steps: [
      "Topang badan di bantalan lengan bawah, punggung menempel di sandaran, kaki menggantung.",
      "Angkat lutut (atau kaki lurus agar lebih berat) ke arah dada dengan melengkungkan panggul memakai perut bawah.",
      "Turunkan pelan.",
    ],
    avoid: "Mengayun. Ini lengkungan terkontrol, bukan tendangan.",
  },
  treadmill: {
    steps: [
      "Pasang kabel pengaman ke pakaianmu, mulai dari jalan pelan, lalu atur kecepatan dan kemiringan.",
      "Berdiri tegak dan ayunkan lengan alami.",
      "Turunkan lagi ke jalan santai untuk pendinginan sebelum berhenti.",
    ],
    avoid: "Berpegangan pada pegangan setelah langkahmu stabil.",
  },
  "stationary-bike": {
    steps: [
      "Atur sadel supaya lutut sedikit menekuk saat pedal di titik terbawah.",
      "Pilih hambatan, duduk tegak dengan pegangan ringan, lalu kayuh dengan irama stabil.",
      "Naikkan hambatan atau kecepatan untuk interval.",
    ],
    avoid: "Lutut melebar ke samping. Lutut tetap searah jari kaki.",
  },
  "rowing-machine": {
    steps: [
      "Ikat kaki dan pegang gagang.",
      "Dorong dengan kaki dulu, lalu bersandar sedikit, lalu tarik gagang ke tulang rusuk bawah: kaki, pinggul, baru lengan.",
      "Kembali dengan urutan terbalik: lengan, pinggul maju, baru tekuk lutut.",
    ],
    avoid: "Gerak menyentak. Halus dan bertenaga.",
  },
  elliptical: {
    steps: [
      "Naik ke pedal dan pegang gagang yang bergerak.",
      "Melangkah halus dan alami, dorong dan tarik dengan lengan dan kaki sambil menjaga badan tegak.",
      "Atur hambatan atau kemiringan untuk intensitas.",
    ],
    avoid: "Tumit terangkat atau badan bersandar di gagang. Tumit tetap turun.",
  },
  "stair-climber": {
    steps: [
      "Naik dan mulai pelan, berdiri tegak dengan pegangan ringan di pegangan tangan.",
      "Ambil langkah penuh dan biarkan kaki yang bekerja.",
      "Atur kecepatan supaya iramanya stabil dan bisa dipertahankan.",
    ],
    avoid: "Bersandar berat di pegangan, karena itu mengurangi usahamu.",
  },
};
