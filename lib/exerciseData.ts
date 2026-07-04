export type ExerciseAlternative = {
  name: string;
  reason: string;
  equipment: string;
};

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "abs";

export type ExerciseDetail = {
  primary: string;
  secondary: string;
  feelIt: string;
  muscleGroup: MuscleGroup;
  formTips: string[];
  mistakes: string[];
  mindset?: string;
};

// ============ Alternatives ============

export const ALTERNATIVES: Record<string, ExerciseAlternative[]> = {
  "Bench Press": [
    { name: "DB Floor Press", reason: "Fokus dada sama, tanpa bench", equipment: "Cuma dumbbell" },
    { name: "Smith Machine Press", reason: "Jalur terpandu, keseimbangan lebih gampang", equipment: "Smith machine" },
    { name: "DB Chest Press (machine)", reason: "Chest press mesin yang terkontrol", equipment: "Mesin chest press" },
    { name: "Push Ups", reason: "Berat badan, selalu bisa", equipment: "Tanpa alat" },
    { name: "Pec Deck", reason: "Isolasi, tanpa setup", equipment: "Mesin pec deck" },
  ],
  "Lat Pulldown": [
    { name: "Pull Ups / Chin Ups", reason: "Gerakan raja pakai berat badan", equipment: "Pull up bar" },
    { name: "Assisted Pull Up Machine", reason: "Nuju pull up tanpa bantuan", equipment: "Mesin assisted pull up" },
    { name: "Single Arm Cable Pulldown", reason: "Unilateral, benerin ketimpangan", equipment: "Cable station" },
    { name: "Resistance Band Pulldown", reason: "Opsi rumah/traveling", equipment: "Resistance band" },
  ],
  "Cable Row": [
    { name: "Seated Row Machine", reason: "Mesin andalan kamu", equipment: "Mesin row" },
    { name: "DB Row", reason: "Row unilateral di bench", equipment: "DB + bench" },
    { name: "Barbell Row", reason: "Tarikan compound berat", equipment: "Barbell" },
    { name: "TRX Row", reason: "Tarikan horizontal berat badan", equipment: "TRX / rings" },
  ],
  "Seated Row Machine": [
    { name: "Cable Row", reason: "Ganti ke cable biar variasi", equipment: "Cable station" },
    { name: "DB Row", reason: "Row unilateral di bench", equipment: "DB + bench" },
    { name: "Barbell Bent Over Row", reason: "Tarikan free-weight berat", equipment: "Barbell" },
    { name: "Machine Row", reason: "Mesin row alternatif", equipment: "Mesin plate-loaded" },
  ],
  "OHP": [
    { name: "Seated DB Press", reason: "Keseimbangan lebih aman, free weight", equipment: "DB + bench" },
    { name: "Smith Machine OHP", reason: "Overhead press terpandu", equipment: "Smith machine" },
    { name: "Cable OHP", reason: "Press tension konstan", equipment: "Cable station" },
    { name: "Arnold Press", reason: "ROM penuh delt depan+samping", equipment: "Dumbbell" },
  ],
  "Cable Lateral Raise": [
    { name: "DB Lateral Raise", reason: "Lateral raise klasik", equipment: "Dumbbell" },
    { name: "Machine Lateral Raise", reason: "Isolasi jalur tetap", equipment: "Mesin lateral raise" },
    { name: "Resistance Band Lateral Raise", reason: "Opsi rumah/traveling", equipment: "Resistance band" },
    { name: "Leaning Cable Lateral Raise", reason: "Stretch lebih dalam di bawah", equipment: "Cable station" },
  ],
  "Tricep Pushdown": [
    { name: "Overhead Tricep Extension", reason: "Fokus long head", equipment: "Cable atau DB" },
    { name: "DB Skull Crusher", reason: "Trisep free weight", equipment: "DB + bench" },
    { name: "Dips", reason: "Compound berat badan", equipment: "Dip bar" },
    { name: "Close Grip Push Up", reason: "Trisep berat badan", equipment: "Tanpa alat" },
  ],
  "Dips": [
    { name: "Tricep Pushdown", reason: "Isolasi cable", equipment: "Cable station" },
    { name: "Bench Dips", reason: "Variasi berat badan lebih gampang", equipment: "Bench" },
    { name: "Overhead Tricep Extension", reason: "Fokus long head", equipment: "Cable atau DB" },
    { name: "Diamond Push Ups", reason: "Close grip berat badan", equipment: "Tanpa alat" },
  ],
  "Squat": [
    { name: "Leg Press", reason: "Quad terpandu mesin", equipment: "Mesin leg press" },
    { name: "Goblet Squat", reason: "Squat beban depan pakai DB", equipment: "Satu DB" },
    { name: "Smith Machine Squat", reason: "Squat barbell terpandu", equipment: "Smith machine" },
    { name: "Bulgarian Split Squat", reason: "Quad + glute unilateral", equipment: "DB + bench" },
  ],
  "Romanian Deadlift": [
    { name: "Leg Curl Machine", reason: "Curl hamstring isolasi", equipment: "Mesin leg curl" },
    { name: "Single Leg RDL", reason: "Keseimbangan unilateral", equipment: "DB" },
    { name: "Good Morning", reason: "Posterior chain barbell", equipment: "Barbell" },
    { name: "Cable Pull Through", reason: "Posterior chain cable", equipment: "Cable station + rope" },
  ],
  "Barbell Curl": [
    { name: "Bicep Curl Machine", reason: "Mesin andalan kamu", equipment: "Mesin curl" },
    { name: "DB Curl", reason: "Klasik free-weight", equipment: "Dumbbell" },
    { name: "Cable Curl", reason: "Tension konstan", equipment: "Cable + straight bar" },
    { name: "EZ Bar Curl", reason: "Curl ramah pergelangan", equipment: "EZ bar" },
  ],
  "Hammer Curl": [
    { name: "Cable Rope Hammer Curl", reason: "Rope curl tension konstan", equipment: "Cable + rope" },
    { name: "Cross Body Curl", reason: "Fokus brachialis", equipment: "Dumbbell" },
    { name: "Neutral Grip DB Curl", reason: "Curl netral duduk", equipment: "DB + bench" },
    { name: "Reverse Curl", reason: "Ketebalan lengan bawah", equipment: "Barbell atau EZ bar" },
  ],

  // ===== Push B =====
  "Seated DB Press": [
    { name: "Standing OHP (Barbell)", reason: "Press compound lebih berat", equipment: "Barbell + rack" },
    { name: "Smith Machine Shoulder Press", reason: "Jalur terpandu, stabilizer nggak cepet capek", equipment: "Smith machine" },
    { name: "Machine Shoulder Press", reason: "Jalur tetap, gampang dorong sampai failure", equipment: "Mesin shoulder press" },
    { name: "Arnold Press", reason: "ROM lebih besar, kena delt depan + samping", equipment: "Dumbbell + bench" },
    { name: "Landmine Press", reason: "Sudut ramah bahu", equipment: "Barbell di landmine" },
    { name: "Single Arm DB Press", reason: "Unilateral, benerin ketimpangan", equipment: "Satu DB" },
    { name: "Pike Push Ups", reason: "Opsi berat badan", equipment: "Tanpa alat" },
  ],
  "Lateral Raise": [
    { name: "Cable Lateral Raise", reason: "Tension konstan sepanjang ROM", equipment: "Cable station" },
    { name: "Machine Lateral Raise", reason: "Jalur tetap sampai failure", equipment: "Mesin lateral raise" },
    { name: "Leaning Cable Lateral Raise", reason: "Stretch maksimal di bawah", equipment: "Cable station" },
    { name: "Resistance Band Lateral Raise", reason: "Opsi rumah/traveling", equipment: "Resistance band" },
    { name: "Lying Side DB Raise", reason: "Form lebih ketat, minim ayunan", equipment: "DB + bench" },
    { name: "Egyptian Lateral Raise", reason: "Variasi stretch berbeban", equipment: "Cable station" },
  ],
  "Incline DB Press": [
    { name: "Iso Lateral Incline Press", reason: "Mesin — pilihan andalan kamu", equipment: "Mesin plate-loaded" },
    { name: "Incline Smith Machine Press", reason: "Incline press terpandu", equipment: "Smith machine + incline bench" },
    { name: "Incline Barbell Press", reason: "Opsi free-weight lebih berat", equipment: "Barbell + incline bench" },
    { name: "Cable Crossover High-to-Low", reason: "Kena dada atas lewat cable", equipment: "Cable station" },
    { name: "Low-to-High Cable Fly", reason: "Isolasi dada atas", equipment: "Cable station" },
    { name: "Incline Push Ups", reason: "Dada atas berat badan", equipment: "Bench atau box" },
  ],
  "Pec Deck": [
    { name: "Cable Chest Fly", reason: "Fly tension konstan", equipment: "Cable station" },
    { name: "DB Fly", reason: "Fly free weight", equipment: "DB + flat bench" },
    { name: "Incline DB Fly", reason: "Fly dada atas", equipment: "DB + incline bench" },
    { name: "Cable Crossover", reason: "Cable fly ROM penuh", equipment: "Cable station" },
    { name: "Resistance Band Fly", reason: "Opsi rumah/traveling", equipment: "Resistance band" },
    { name: "Chest Press Machine", reason: "Ganti ke press kalau deck kepakai", equipment: "Mesin chest press" },
  ],
  "Overhead Tricep Extension": [
    { name: "Rope Overhead Extension", reason: "Long head tension konstan", equipment: "Cable + rope" },
    { name: "EZ Bar Skull Crusher", reason: "Kerja long head berat", equipment: "EZ bar + bench" },
    { name: "Single Arm Overhead Cable", reason: "Stretch unilateral", equipment: "Cable station" },
    { name: "DB Overhead Extension", reason: "DB dua tangan di atas kepala", equipment: "Satu DB" },
    { name: "Tricep Pushdown (Rope)", reason: "Pindah fokus ke lateral head", equipment: "Cable + rope" },
    { name: "Close Grip Push Up", reason: "Cadangan berat badan", equipment: "Tanpa alat" },
  ],
  "Lateral Raise Burnout": [
    { name: "Cable Lateral Raise Burnout", reason: "Finisher tension konstan", equipment: "Cable station" },
    { name: "Band Lateral Raise", reason: "Burn rep tinggi berat badan", equipment: "Resistance band" },
    { name: "Partial Lateral Raises", reason: "Setengah rep sampai failure", equipment: "DB ringan" },
    { name: "Machine Lateral Burnout", reason: "Mesin ramah drop-set", equipment: "Mesin lateral raise" },
  ],

  // ===== Pull B =====
  "Deadlift": [
    { name: "Trap Bar Deadlift", reason: "Postur lebih ramah sendi", equipment: "Trap bar" },
    { name: "Rack Pull", reason: "Tarikan separuh atas lebih berat", equipment: "Barbell + rack" },
    { name: "Romanian Deadlift", reason: "Fokus hinge, beban lebih ringan", equipment: "Barbell" },
    { name: "Sumo Deadlift", reason: "ROM lebih pendek, ikut kena quad", equipment: "Barbell" },
    { name: "DB Deadlift", reason: "Pengganti lebih ringan pas bar kepakai", equipment: "DB berat" },
    { name: "Hip Thrust", reason: "Alternatif hinge glute/hamstring", equipment: "Barbell + bench" },
  ],
  "Wide Grip Pulldown": [
    { name: "Pull Ups", reason: "Tarikan lat raja pakai berat badan", equipment: "Pull up bar" },
    { name: "Assisted Pull Up Machine", reason: "Nuju tanpa bantuan", equipment: "Mesin assisted pull up" },
    { name: "Neutral Grip Pulldown", reason: "Grip ramah bahu", equipment: "Cable station + neutral bar" },
    { name: "Single Arm Cable Pulldown", reason: "Unilateral, benerin ketimpangan", equipment: "Cable station" },
    { name: "Lat Prayer (Kneeling Cable)", reason: "Isolasi fokus stretch", equipment: "Cable station + rope" },
    { name: "Resistance Band Pulldown", reason: "Opsi rumah/traveling", equipment: "Resistance band" },
  ],
  "Cable Row Wide": [
    { name: "Seated Row Machine", reason: "Ganti mesin, sudut sama", equipment: "Mesin row" },
    { name: "Chest Supported Row", reason: "Form ketat, punggung bawah aman", equipment: "Bench row chest-supported" },
    { name: "T-Bar Row", reason: "Row free-weight berat", equipment: "T-bar atau landmine" },
    { name: "Barbell Bent Over Row", reason: "Row free-weight compound", equipment: "Barbell" },
    { name: "Meadows Row", reason: "Row landmine unilateral", equipment: "Landmine + barbell" },
    { name: "Inverted Row", reason: "Tarikan horizontal berat badan", equipment: "Smith bar atau rings" },
  ],
  "DB Row": [
    { name: "Chest Supported DB Row", reason: "Ilangin punggung bawah, form ketat", equipment: "Incline bench + DB" },
    { name: "Single Arm Cable Row", reason: "Tension cable sepanjang gerakan", equipment: "Cable station" },
    { name: "Kroc Row", reason: "Row unilateral rep tinggi berat", equipment: "DB berat" },
    { name: "Seal Row", reason: "Tiduran di bench, tarikan ketat", equipment: "Bench tinggi + DB" },
    { name: "Pendlay Row", reason: "Row barbell eksplosif", equipment: "Barbell" },
    { name: "TRX Row", reason: "Tarikan horizontal berat badan", equipment: "TRX / rings" },
  ],
  "Face Pull": [
    { name: "DB Rear Delt Fly", reason: "Rear delt free weight", equipment: "DB" },
    { name: "Reverse Pec Deck", reason: "Rear delt jalur tetap", equipment: "Mesin pec deck" },
    { name: "Band Pull Apart", reason: "Pemanasan/burnout band", equipment: "Band" },
    { name: "Cable Rear Delt Row", reason: "High row grip lebar", equipment: "Cable station" },
    { name: "Single Arm Cable Rear Delt", reason: "Rear delt unilateral", equipment: "Cable station" },
    { name: "Seated Rear Delt Fly", reason: "Versi chest-supported ketat", equipment: "Incline bench + DB" },
  ],
  "Incline Curl": [
    { name: "Bayesian Cable Curl", reason: "Curl bisep fokus stretch", equipment: "Cable station" },
    { name: "Preacher Curl", reason: "Isolasi, nggak bisa curang", equipment: "Preacher bench + bar" },
    { name: "Spider Curl", reason: "Curl telungkup di bench, kontraksi puncak", equipment: "Incline bench + DB" },
    { name: "Cable Curl", reason: "Tension konstan", equipment: "Cable + straight bar" },
    { name: "Concentration Curl", reason: "Isolasi duduk ketat", equipment: "DB + bench" },
    { name: "DB Curl", reason: "Cadangan free-weight simpel", equipment: "Dumbbell" },
  ],
};

// ============ Muscle focus / detail ============

export const MINDSET_QUOTES: Record<MuscleGroup, string> = {
  chest: "Tiap rep pas stretch di bawah = serat dada robek = tumbuh. Buru-buru = nol.",
  back: "Tangan kamu cuma pengait. Punggung yang narik. Putusin lengan secara mental.",
  shoulders: "Lateral raise bikin V-taper lebih dari gerakan lain. 5 set tiap Push B. Jangan beban gengsi.",
  arms: "Negatif pelan bikin massa bisep lebih dari beban berat pakai momentum. 4 detik turun tiap rep.",
  legs: "Nggak ada yang mau leg day. Semua mau V-taper. Kaki nopang semuanya. Jangan di-skip.",
  abs: "Perut kelihatan gara-gara diet. Dibentuk pakai cable crunch. Kamu butuh dua-duanya.",
};

export const EXERCISE_DETAILS: Record<string, ExerciseDetail> = {
  "Bench Press": {
    primary: "Pectoralis Major (dada)",
    secondary: "Delt depan, trisep",
    feelIt: "Panas di tengah dada, bukan bahu",
    muscleGroup: "chest",
    formTips: [
      "Kaki napak di lantai, sedikit lengkung di punggung bawah",
      "Grip sedikit lebih lebar dari bahu",
      "Bar nyentuh dada bawah, bukan leher",
      "Turun negatif terkontrol 3 detik",
      "Dorong bar sedikit ke belakang di atas",
      "Jangan mantulin bar di dada",
    ],
    mistakes: [
      "Siku mengembang 90° — jaga ~45° biar bahu aman",
      "Pantat ngangkat dari bench — curang dan rawan cedera",
      "Rep setengah — selalu full range of motion",
    ],
    mindset:
      "Rasain stretch dada di bawah. Bahu sakit = grip kelebaran. Panasnya cuma di dada.",
  },
  "Incline DB Press": {
    primary: "Dada atas (clavicular head)",
    secondary: "Delt depan, trisep",
    feelIt: "Dada bagian atas dekat tulang selangka",
    muscleGroup: "chest",
    formTips: [
      "Sudut bench 30° — lebih tinggi bebannya pindah ke delt",
      "DB sejajar di atas dada atas, bukan bahu",
      "Turunin sampai kerasa stretch, jangan lebih",
      "Dorong naik dengan sedikit lengkung, jangan adu DB",
    ],
    mistakes: [
      "Bench kecuraman — malah jadi OHP",
      "Nurunin DB kecepetan — tension ilang = gains ilang",
    ],
    mindset:
      "Dada atas yang bikin kamu keliatan lebar dari depan. Tiap rep di sini bangun shelf-nya.",
  },
  "Lat Pulldown": {
    primary: "Latissimus dorsi (lebar punggung)",
    secondary: "Bisep, delt belakang",
    feelIt: "Sensasi tarikan lebar di bawah ketiak",
    muscleGroup: "back",
    formTips: [
      "Grip lebih lebar dari bahu, jempol di atas bar",
      "Condong ke belakang 10°, dada busung",
      "Tarik bar ke dada atas, dorong siku ke BAWAH",
      "Remas lat kuat-kuat di bawah",
      "Balik pelan terkontrol — 3 detik naik",
    ],
    mistakes: [
      "Narik pakai bisep — putusin lengan secara mental",
      "Condong kejauhan — malah jadi row",
      "Nggak dapet stretch penuh di atas",
    ],
    mindset:
      "Tangan cuma pengait. Lat yang narik. Bayangin nekuk bar. Rasain di bawah ketiak — itu lat aktif.",
  },
  "Cable Row": {
    primary: "Punggung tengah (rhomboid, trap tengah)",
    secondary: "Bisep, delt belakang",
    feelIt: "Remasan di antara tulang belikat",
    muscleGroup: "back",
    formTips: [
      "Duduk tegak, dada busung, bahu ke belakang",
      "Tarik handle ke tulang rusuk bawah, siku rapat",
      "Remas tulang belikat rapat KUAT",
      "Balik pelan 2 detik, stretch penuh",
    ],
    mistakes: [
      "Punggung bawah membungkuk — jaga tulang belakang",
      "Nyentak pakai momentum — selalu terkontrol",
    ],
    mindset:
      "Jepit pensil di antara tulang belikat di akhir tiap rep. Tahan 1 detik.",
  },
  "Seated Row Machine": {
    primary: "Punggung tengah (rhomboid, trap tengah)",
    secondary: "Bisep, delt belakang",
    feelIt: "Remasan di antara tulang belikat",
    muscleGroup: "back",
    formTips: [
      "Dada nempel pad, bahu ke belakang",
      "Dorong siku ke belakang, bukan lengan",
      "Jeda 1 detik di kontraksi penuh",
      "Balik pelan, stretch penuh",
    ],
    mistakes: [
      "Bahu membungkuk ke depan pas balik",
      "Kebanyakan pakai lengan / bisep",
    ],
    mindset:
      "Punggung, bukan bisep. Mulai tiap tarikan dari punggung tengah. Lengan cuma megang handle.",
  },
  "OHP": {
    primary: "Delt depan, delt samping",
    secondary: "Trisep, dada atas",
    feelIt: "Seluruh bahu panas, bukan leher",
    muscleGroup: "shoulders",
    formTips: [
      "Bar mulai di tulang selangka",
      "Kencangin core kuat, glute rapat",
      "Dorong lurus ke atas, kepala maju lewatin bar",
      "Kunci dengan bar di atas tengah kaki",
    ],
    mistakes: [
      "Condong ke belakang berlebihan — malah jadi incline press",
      "Core lembek = bar goyang = cedera",
    ],
    mindset:
      "Tiap rep overhead bangun bahu segede batu. Rasain delt depan kerja. Dorong langit-langit.",
  },
  "Cable Lateral Raise": {
    primary: "Delt samping (deltoid medial)",
    secondary: "Trap (kalau salah)",
    feelIt: "Cuma sisi bahu, bukan trap",
    muscleGroup: "shoulders",
    formTips: [
      "Handle cable menyilang badan (tangan berlawanan)",
      "Siku ditekuk sedikit, kunci di situ",
      "Pimpin pakai siku, bukan tangan",
      "Angkat setinggi bahu, jangan lebih",
      "Negatif pelan 3 detik",
    ],
    mistakes: [
      "Ngangkat bahu — trap yang ambil alih",
      "Naik di atas bahu — delt lepas kerja",
    ],
    mindset:
      "Gerakan ini bangun V-taper lebih dari apa pun. Beban ringan, form sempurna, panas.",
  },
  "Lateral Raise": {
    primary: "Delt samping (deltoid medial)",
    secondary: "Trap (kalau salah)",
    feelIt: "Cuma sisi bahu, bukan trap",
    muscleGroup: "shoulders",
    formTips: [
      "Siku ditekuk sedikit, kunci posisi",
      "Pimpin pakai siku, kelingking sedikit naik",
      "Angkat setinggi bahu, jeda 1 detik",
      "Negatif terkontrol pelan 3 detik",
    ],
    mistakes: [
      "Ngayun pakai momentum — tension delt nol",
      "Keberatan — trap bajak gerakannya",
    ],
  },
  "Tricep Pushdown": {
    primary: "Trisep (ketiga head)",
    secondary: "—",
    feelIt: "Belakang lengan, bukan bahu",
    muscleGroup: "arms",
    formTips: [
      "Siku nempel di tulang rusuk",
      "Cuma lengan bawah yang gerak",
      "Kunci penuh di bawah, remas 1 detik",
      "Balik pelan, stretch penuh di atas",
    ],
    mistakes: [
      "Siku maju ke depan — bahu yang ambil alih",
      "Nyondong buat dorong — pakai trisep doang",
    ],
    mindset:
      "Siku diem. Cuma lengan bawah yang gerak. Remas di bawah kayak mecahin kenari.",
  },
  "Dips": {
    primary: "Dada bawah, trisep",
    secondary: "Delt depan",
    feelIt: "Dada bawah + belakang lengan",
    muscleGroup: "chest",
    formTips: [
      "Condong ke depan buat fokus dada, tegak buat trisep",
      "Turun sampai lengan atas sejajar lantai",
      "Jaga bahu turun, jauh dari telinga",
      "Kunci penuh di atas",
    ],
    mistakes: [
      "Terlalu dalam — rawan impingement bahu",
      "Ngangkat bahu di bawah",
    ],
    mindset:
      "Condong ke depan = dada. Tetap tegak = trisep. Pilih kemiringan sesuai yang mau kamu gedein.",
  },
  "Squat": {
    primary: "Quad, glute",
    secondary: "Hamstring, core, betis",
    feelIt: "Paha depan panas",
    muscleGroup: "legs",
    formTips: [
      "Kaki selebar bahu, ujung kaki sedikit keluar",
      "Kencangin core, dada busung",
      "Pinggul ke belakang dan turun, lutut searah ujung kaki",
      "Lipatan pinggul di bawah lutut (parallel+)",
      "Dorong lewat tengah kaki, bukan ujung jari",
    ],
    mistakes: [
      "Lutut ambruk ke dalam — dorong KELUAR",
      "Tumit ngangkat — beban di tengah kaki",
      "Punggung bawah membungkuk di bawah",
    ],
    mindset:
      "Nggak ada yang suka squat. Semua mau V-taper. Kaki nopang semuanya. Full depth atau nggak sama sekali.",
  },
  "Romanian Deadlift": {
    primary: "Hamstring, glute",
    secondary: "Punggung bawah, core",
    feelIt: "Stretch dan tarikan di hamstring",
    muscleGroup: "legs",
    formTips: [
      "Lutut rileks, jangan nekuk lagi pas turun",
      "Dorong pinggul ke belakang, bar meluncur turun di paha",
      "Turun sampai kerasa stretch hamstring",
      "Dorong pinggul ke depan buat berdiri, remas glute",
    ],
    mistakes: [
      "Malah nyquat — lutut harusnya diem",
      "Punggung bawah membungkuk — stop sebelum titik itu",
    ],
    mindset:
      "Rasain stretch hamstring di bawah. Kalau nggak kerasa — kamu nyquat, bukan hinge.",
  },
  "Face Pull": {
    primary: "Delt belakang, rotator cuff",
    secondary: "Trap, rhomboid",
    feelIt: "Belakang bahu, bukan leher",
    muscleGroup: "shoulders",
    formTips: [
      "Rope setinggi wajah, pisahin tali rope",
      "Tarik ke dahi, siku tinggi",
      "Rotasi keluar di akhir — jempol ke belakang",
      "Remas delt belakang 1 detik",
    ],
    mistakes: [
      "Narik ke dada — malah jadi row",
      "Keberatan — form rusak",
    ],
    mindset:
      "Ini bikin bahu kamu sehat. Tiap sesi gym butuh face pull. Jangan pernah di-skip.",
  },
  "Barbell Curl": {
    primary: "Biceps brachii",
    secondary: "Brachialis, brachioradialis",
    feelIt: "Depan lengan, kontraksi puncak di atas",
    muscleGroup: "arms",
    formTips: [
      "Siku nempel di tulang rusuk",
      "Grip selebar bahu",
      "Curl tanpa ngayun",
      "Remas di atas, negatif pelan 3 detik",
    ],
    mistakes: [
      "Ngayun dari pinggul — bisep nggak ikut kerja",
      "Siku maju ke depan — malah jadi front raise",
    ],
    mindset:
      "Negatif pelan bikin bisep lebih dari naiknya. 4 detik turun. Tiap rep.",
  },
  "Hammer Curl": {
    primary: "Brachialis, brachioradialis",
    secondary: "Bisep",
    feelIt: "Ketebalan lengan luar dan lengan bawah",
    muscleGroup: "arms",
    formTips: [
      "Grip netral sepanjang gerakan (jempol ke atas)",
      "Siku nempel di tulang rusuk",
      "Gantian atau bareng — dua-duanya oke",
      "Negatif pelan 3 detik",
    ],
    mistakes: [
      "Muter pergelangan di atas — malah jadi DB curl",
      "Ngayun dari bahu",
    ],
    mindset:
      "Hammer curl bangun ketebalan lengan dan lengan bawah. Otot yang bikin lengan keliatan penuh dari samping.",
  },
  "Leg Press": {
    primary: "Quad, glute",
    secondary: "Hamstring",
    feelIt: "Paha depan, bukan punggung bawah",
    muscleGroup: "legs",
    formTips: [
      "Kaki selebar bahu, di tengah platform",
      "Turun sampai lutut 90°",
      "Jangan biarin punggung bawah lepas membungkuk dari pad",
      "Dorong lewat tumit, jangan kunci keras",
    ],
    mistakes: [
      "Pantat ngangkat dari pad — pendekin ROM",
      "Kunci lutut keras — stres sendi",
    ],
  },
  "Leg Curl": {
    primary: "Hamstring",
    secondary: "Betis",
    feelIt: "Belakang paha, range penuh",
    muscleGroup: "legs",
    formTips: [
      "Pinggul ditekan ke pad",
      "Kontraksi penuh di atas, remas",
      "Negatif pelan 3 detik sampai stretch penuh",
      "Ujung kaki netral atau sedikit dorsifleksi",
    ],
    mistakes: [
      "Pinggul ngangkat dari pad — rep curang",
      "Range setengah — gains setengah",
    ],
  },
  "Calf Raise": {
    primary: "Gastrocnemius, soleus",
    secondary: "—",
    feelIt: "Stretch penuh di bawah, remas di atas",
    muscleGroup: "legs",
    formTips: [
      "Stretch penuh di bawah — jeda 1 detik",
      "Naik di ujung telapak kaki, remas 1 detik di atas",
      "Tempo terkontrol dua arah",
    ],
    mistakes: [
      "Mantul-mantul — tendon yang kerja, bukan betis",
      "ROM setengah — betis butuh stretch PENUH",
    ],
    mindset:
      "Betis cuma respon ke rep tinggi dengan range penuh. Pelanin. Rasain panasnya di atas.",
  },
  "Cable Crunch": {
    primary: "Rectus abdominis (perut atas)",
    secondary: "Oblique",
    feelIt: "Perut yang ngercrunch, BUKAN punggung bawah",
    muscleGroup: "abs",
    formTips: [
      "Berlutut, rope di belakang kepala",
      "Crunch dada ke arah lutut, pinggul diem",
      "Bungkukin punggung — jangan nekuk dari pinggul",
      "Remas perut kuat di bawah",
    ],
    mistakes: [
      "Narik pakai lengan / trisep — tangan cuma pengait",
      "Hinge dari pinggul — perut lepas kerja total",
    ],
    mindset:
      "Perut dibentuk di sini. Kelihatan gara-gara diet. Pinggul diem. Cuma tulang belakang yang nekuk.",
  },
};

export function getExerciseDetail(name: string): ExerciseDetail | null {
  return EXERCISE_DETAILS[name] ?? null;
}

export function getAlternatives(name: string): ExerciseAlternative[] {
  return ALTERNATIVES[name] ?? [];
}

// ============================================================
// Visual demos — two-frame loops from the open-source
// `yuhonas/free-exercise-db` library (MIT). Served via the
// jsDelivr CDN so we don't bash GitHub raw rate limits.
// ============================================================

const DEMO_BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

/** Maps an exercise name (or canonical alias) to a verified slug in the
 * free-exercise-db. Each slug folder contains `0.jpg` and `1.jpg` for the
 * start and end positions. Every name in SESSIONS + ALTERNATIVES has a
 * mapping below so the swap sheet's HOW preview never falls back to
 * "no demo image". Slugs are best-fit when an exact equivalent is
 * missing — the visual still communicates the correct movement pattern. */
const DEMO_SLUGS: Record<string, string> = {
  // ---------- Push A / Push B ----------
  "Bench Press":                 "Barbell_Bench_Press_-_Medium_Grip",
  "Flat Bench Press":            "Barbell_Bench_Press_-_Medium_Grip",
  "Incline DB Press":            "Incline_Dumbbell_Press",
  "Incline Dumbbell Press":      "Incline_Dumbbell_Press",
  "Incline Barbell Press":       "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "Incline Smith Machine Press": "Smith_Machine_Incline_Bench_Press",
  "Iso Lateral Incline Press":   "Smith_Machine_Incline_Bench_Press",
  "Smith Machine Press":         "Smith_Machine_Bench_Press",
  "DB Floor Press":              "Dumbbell_Floor_Press",
  "DB Chest Press (machine)":    "Dumbbell_Bench_Press",
  "Chest Press Machine":         "Cable_Chest_Press",
  "Cable Chest Fly":             "Cable_Crossover",
  "Cable Crossover":             "Cable_Crossover",
  "Cable Crossover High-to-Low": "Cable_Crossover",
  "Low-to-High Cable Fly":       "Low_Cable_Crossover",
  "DB Fly":                      "Dumbbell_Flyes",
  "Incline DB Fly":              "Incline_Dumbbell_Flyes",
  "Resistance Band Fly":         "Cable_Crossover",
  "Pec Deck":                    "Butterfly",
  "Push Ups":                    "Pushups",
  "Diamond Push Ups":            "Pushups",
  "Close Grip Push Up":          "Close-Grip_Push-Up_off_of_a_Dumbbell",
  "Incline Push Ups":            "Incline_Push-Up",
  "Dips":                        "Dips_-_Triceps_Version",
  "Bench Dips":                  "Bench_Dips",
  "Cable Lateral Raise":         "Side_Lateral_Raise",
  "Cable Lateral Raise Burnout": "Side_Lateral_Raise",
  "Lateral Raise":               "Side_Lateral_Raise",
  "Lateral Raise Burnout":       "Side_Lateral_Raise",
  "DB Lateral Raise":            "Side_Lateral_Raise",
  "Machine Lateral Raise":       "Cable_Seated_Lateral_Raise",
  "Machine Lateral Burnout":     "Cable_Seated_Lateral_Raise",
  "Band Lateral Raise":          "Lateral_Raise_-_With_Bands",
  "Resistance Band Lateral Raise":"Lateral_Raise_-_With_Bands",
  "Egyptian Lateral Raise":      "Lying_One-Arm_Lateral_Raise",
  "Leaning Cable Lateral Raise": "Lying_One-Arm_Lateral_Raise",
  "Lying Side DB Raise":         "Lying_One-Arm_Lateral_Raise",
  "Partial Lateral Raises":      "Side_Lateral_Raise",
  "OHP":                         "Standing_Military_Press",
  "Standing OHP (Barbell)":      "Standing_Military_Press",
  "Cable OHP":                   "Cable_Iron_Cross",
  "Smith Machine OHP":           "Standing_Military_Press",
  "Smith Machine Shoulder Press":"Standing_Military_Press",
  "Machine Shoulder Press":      "Standing_Military_Press",
  "Seated DB Press":             "Seated_Dumbbell_Press",
  "Single Arm DB Press":         "Seated_Dumbbell_Press",
  "Arnold Press":                "Arnold_Dumbbell_Press",
  "Landmine Press":              "Landmine_Linear_Jammer",
  "Tricep Pushdown":             "Triceps_Pushdown",
  "Tricep Pushdown (Rope)":      "Triceps_Pushdown_-_Rope_Attachment",
  "Overhead Tricep Extension":   "Standing_Dumbbell_Triceps_Extension",
  "DB Overhead Extension":       "Standing_Dumbbell_Triceps_Extension",
  "Rope Overhead Extension":     "Cable_Rope_Overhead_Triceps_Extension",
  "Single Arm Overhead Cable":   "Cable_Rope_Overhead_Triceps_Extension",
  "DB Skull Crusher":            "EZ-Bar_Skullcrusher",
  "EZ Bar Skull Crusher":        "EZ-Bar_Skullcrusher",
  // ---------- Pull A / Pull B ----------
  "Lat Pulldown":                "Wide-Grip_Lat_Pulldown",
  "Wide Grip Pulldown":          "Wide-Grip_Lat_Pulldown",
  "Neutral Grip Pulldown":       "Close-Grip_Front_Lat_Pulldown",
  "Single Arm Cable Pulldown":   "Kneeling_Single-Arm_High_Pulley_Row",
  "Lat Prayer (Kneeling Cable)": "Kneeling_Single-Arm_High_Pulley_Row",
  "Resistance Band Pulldown":    "Close-Grip_Front_Lat_Pulldown",
  "Pull Ups":                    "Weighted_Pull_Ups",
  "Pull Ups / Chin Ups":         "Chin-Up",
  "Assisted Pull Up Machine":    "Band_Assisted_Pull-Up",
  "Cable Row":                   "Seated_Cable_Rows",
  "Cable Row Wide":              "Seated_Cable_Rows",
  "Seated Row Machine":          "Seated_Cable_Rows",
  "Single Arm Cable Row":        "One-Arm_Dumbbell_Row",
  "Machine Row":                 "Seated_Cable_Rows",
  "T-Bar Row":                   "Lying_T-Bar_Row",
  "Barbell Row":                 "Bent_Over_Barbell_Row",
  "Barbell Bent Over Row":       "Bent_Over_Barbell_Row",
  "Pendlay Row":                 "Bent_Over_Barbell_Row",
  "DB Row":                      "Bent_Over_Two-Dumbbell_Row",
  "Chest Supported DB Row":      "One-Arm_Dumbbell_Row",
  "Chest Supported Row":         "One-Arm_Dumbbell_Row",
  "Seal Row":                    "Bent_Over_Two-Dumbbell_Row",
  "Kroc Row":                    "One-Arm_Dumbbell_Row",
  "Meadows Row":                 "One-Arm_Dumbbell_Row",
  "Inverted Row":                "Inverted_Row",
  "TRX Row":                     "Suspended_Row",
  "Face Pull":                   "Face_Pull",
  "Cable Rear Delt Row":         "Cable_Rope_Rear-Delt_Rows",
  "Cable Rear Delt":             "Cable_Rear_Delt_Fly",
  "Single Arm Cable Rear Delt":  "Cable_Rear_Delt_Fly",
  "DB Rear Delt Fly":            "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench",
  "Seated Rear Delt Fly":        "Seated_Bent-Over_Rear_Delt_Raise",
  "Reverse Pec Deck":            "Reverse_Flyes",
  "Band Pull Apart":             "Band_Pull_Apart",
  "Barbell Curl":                "Barbell_Curl",
  "EZ Bar Curl":                 "EZ-Bar_Curl",
  "Hammer Curl":                 "Hammer_Curls",
  "Cable Curl":                  "High_Cable_Curls",
  "Cable Rope Hammer Curl":      "Cable_Hammer_Curls_-_Rope_Attachment",
  "Bayesian Cable Curl":         "High_Cable_Curls",
  "Bicep Curl Machine":          "Machine_Bicep_Curl",
  "DB Curl":                     "Hammer_Curls",
  "Neutral Grip DB Curl":        "Hammer_Curls",
  "Cross Body Curl":             "Cross_Body_Hammer_Curl",
  "Concentration Curl":          "Concentration_Curls",
  "Spider Curl":                 "Spider_Curl",
  "Preacher Curl":               "Preacher_Curl",
  "Reverse Curl":                "Reverse_Barbell_Curl",
  "Incline Curl":                "Incline_Dumbbell_Curl",
  // ---------- Legs / Posterior chain ----------
  "Squat":                       "Barbell_Squat",
  "Smith Machine Squat":         "Smith_Machine_Squat",
  "Goblet Squat":                "Goblet_Squat",
  "Bulgarian Split Squat":       "Split_Squat_with_Dumbbells",
  "Romanian Deadlift":           "Romanian_Deadlift",
  "Single Leg RDL":              "Romanian_Deadlift",
  "Deadlift":                    "Barbell_Deadlift",
  "DB Deadlift":                 "Romanian_Deadlift",
  "Sumo Deadlift":               "Sumo_Deadlift",
  "Trap Bar Deadlift":           "Trap_Bar_Deadlift",
  "Rack Pull":                   "Rack_Pulls",
  "Good Morning":                "Good_Morning",
  "Hip Thrust":                  "Barbell_Hip_Thrust",
  "Cable Pull Through":          "Pull_Through",
  "Leg Press":                   "Leg_Press",
  "Leg Curl":                    "Lying_Leg_Curls",
  "Leg Curl Machine":            "Lying_Leg_Curls",
  "Calf Raise":                  "Standing_Barbell_Calf_Raise",
  // ---------- Shoulders / Misc ----------
  "Pike Push Ups":               "Handstand_Push-Ups",
  "Cable Crunch":                "Cable_Crunch",
  "Plank":                       "Plank",
};

export type ExerciseDemo = {
  /** Two URLs that, when alternated, produce a "before / after" loop. */
  frames: [string, string];
  /** Human-readable name from the source library. */
  source: "free-exercise-db";
};

export function getExerciseDemo(name: string): ExerciseDemo | null {
  const slug = DEMO_SLUGS[name];
  if (!slug) return null;
  return {
    frames: [
      `${DEMO_BASE}/${slug}/0.jpg`,
      `${DEMO_BASE}/${slug}/1.jpg`,
    ],
    source: "free-exercise-db",
  };
}

/** Always-available fallback: opens a YouTube search for the exercise so the
 * user can watch a real video if the static frames don't make the move
 * obvious. */
export function youtubeSearchUrl(name: string): string {
  const q = encodeURIComponent(`${name} proper form tutorial`);
  return `https://www.youtube.com/results?search_query=${q}`;
}
