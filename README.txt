SIMUNGIL — A LITTLE WORLD MADE JUST FOR YOU
===========================================

Cara memakai
1. Buka  index.html  di browser (atau unggah ke GitHub Pages). Tidak perlu server atau instalasi.
2. Musik & efek suara mulai setelah tombol "Open Your Little World" diketuk (aturan autoplay browser).
3. Musik latar: jika kamu menaruh  music.mp3  di folder  assets/  , file itu yang diputar.
   Kalau tidak ada, otomatis dipakai kotak musik buatan (dibuat langsung oleh browser, tanpa file).
4. Efek suara (klik, ganti halaman, pesan muncul, kejutan, balasan) dibuat dengan Web Audio, tanpa file.
   Tombol musik & speaker di pojok kanan atas mematikan/menyalakan; pilihan diingat.
5. Kejutan kecil: ketuk boneka, kue (tiup lilin), segel surat, foto, dan daftar janji.

Struktur
  index.html   struktur 7 halaman + dekorasi SVG + gerbang kunci (#lk)
  style.css    tampilan & animasi (gaya gerbang ada di bagian akhir, awalan "lk-")
  script.js    navigasi slide + sistem audio + efek kecil (satu baris pengaman ditambahkan untuk gerbang)
  lock.js      BARU: pengendali gerbang kunci (terpisah dari script.js)
  assets/      childhood.jpg, recent.jpg, together.jpg, music.mp3 (dari kamu)

Tombol balasan di halaman terakhir membuka WhatsApp ke nomor yang ditentukan dengan pesan awal: "Sayangkuhh aku suka maacihh😭💗".

Mengganti foto: timpa file di assets/ dengan nama yang sama (disarankan lebar maks ~1000px).
Mengubah tulisan: edit teks langsung di index.html.

Versi satu file: Untuk_Simungil_Birthday.html (foto sudah tertanam).
Cukup taruh music.mp3 di folder yang sama dengan file itu.
(Catatan: versi satu file itu tidak ikut dalam ZIP ini dan TIDAK memiliki gerbang kunci.)


GERBANG KUNCI "BLACK OPS CLASSIFIED ACCESS" (BARU)
==================================================
Urutan: layar terminal terkunci -> tebak kata sandi -> animasi gembok terbuka ->
halaman pembuka asli muncul -> pengunjung mengetuk "Open Your Little World ♡" -> situs berjalan seperti biasa.

* Kata sandi yang diterima persis enam: suami, Suami, suamiku, Suamiku, "suami ku", "Suami ku".
  Selain itu (termasuk huruf besar/kecil lain atau spasi tambahan) ditolak. Jawaban tidak pernah ditampilkan;
  di kode pun hanya tersimpan sebagai hash (fungsi h53 + daftar OK di lock.js).
* Petunjuk hanya berupa kalimat samar di terminal; tidak bertambah mudah karena jumlah percobaan.
* Salah: ACCESS DENIED, kilat merah singkat, getar layar singkat, nada rendah, bisa langsung coba lagi (tanpa batas).
* Benar: AUTHENTICATION ACCEPTED -> IDENTITY VERIFIED -> ACCESS GRANTED -> SECURITY CLEARANCE ACCEPTED,
  gembok terbuka, lalu situs asli tampil (~3,6 detik).
* Efek suara gerbang (klik, relay, nada tolak, gembok lepas) dibuat Web Audio terpisah, hanya efek —
  TIDAK ADA musik di gerbang. Jika efek suara dimatikan di preferensi situs, gerbang pun diam.
  Gerbang hanya membaca preferensi itu, tidak pernah menulisnya. Getar (jika didukung) singkat; mati saat reduced-motion.
* MUSIK ASLI TETAP HANYA MULAI SAAT TOMBOL ASLI "Open Your Little World ♡" DIKETUK. Tidak ada musik saat halaman dimuat,
  di layar kunci, saat mengetik/mengirim kata sandi, saat gembok terbuka, atau saat halaman pembuka tampil.
  Tidak ada klik otomatis; tombol aslinya tidak diubah. Tombol gerbang tidak memakai atribut data-action, dan
  pendengar klik di script.js kini mengabaikan klik di dalam gerbang.
* Selama terkunci, situs asli disembunyikan dan di-inert (tak bisa diklik/difokus). Tanpa JavaScript, gerbang tidak tampil.
* Jujur soal keamanan: ini situs statis; gerbang ini teka-teki visual, bukan perlindungan sungguhan terhadap
  orang yang membuka kode sumber. Semua tulisan "diagnostik" adalah simulasi lokal; tidak ada yang dipindai.
