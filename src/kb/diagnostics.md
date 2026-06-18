# BengkelBot — Petunjuk Diagnosis Awal

## Cara membaca bagian ini
Bot menggunakan bagian ini untuk:
1. Membantu pelanggan mendeskripsikan masalah mereka
2. Mengarahkan ke jenis service yang tepat
3. Memberikan estimasi awal sebelum montir cek langsung

---

## Gejala → Kemungkinan Penyebab → Service yang Direkomendasikan

### 1. Mobil bunyi saat jalan

| Gejala spesifik | Kemungkinan penyebab |
|---|---|
| Bunyi "tek-tek-tek" dari depan | V-belt aus, pulley bermasalah, belt alternator longgar |
| Bunyi gemeretik dari bawah | Bantingan kopling aus, driveshaft perlu greasing |
| Bunyi "ngeeng" saat belok | CV boot rusak, baut CV joint longgar |
| Bunyi kasar dari mesin | Oli kurang, busi lemah, koil bocor |
| Bunyi "klitik-klitik" saat idle | Tappet aus, klep longgar |

**Service**: Diagnosa Kerusakan (Rp 50.000 - 150.000) → lalu baru diketahui下一步

### 2. Rem bermasalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Rem berdecit waktu pertama injek | Kampas rem aus / perlu dibersihkan |
| Rem ngoros saat diinjak | Cairan rem rendah / kampas habis |
| Rem keras (sulit diinjak) | Booster rem bermasalah / master silinder |
| Rem mengklong satu roda | Cylinder rem macet / selang rem tersumbat |
| Mobil menarik satu sisi saat rem | Kampas aus tidak merata / disc bermasalah |

**Service**: Ganti Rem / Servis Rem Completo

### 3. Mesin sulit hidup / mogok

| Gejala | Kemungkinan penyebab |
|---|---|
| Sulit hidup pagi hari | Accu lemah / busi kotor |
| Mati mesin saat idle | Idle air control valve kotor |
| Mesin mati mendadak | Alternator rusak → listrik mati |
| Hidup tapi bolak-balik mati | Koil lemah / sensor MAP bermasalah |
| Bunyi starter doang tapi mesin ndak hidup | Starter aus / ringger kopling |

**Service**: Tune Up / Ganti Aki / Diagnosa Kerusakan

### 4. Mobil panas (overheat)

| Gejala | Kemungkinan penyebab |
|---|---|
| Jarum suhu naik saat jalan | Kipas radiator mati / thermostat macet |
| Air radiator habis terus | Selang bocor / radiator bocor / head gasket |
| Air rem berbusa | Oli masuk sistem pendingin (head gasket terbakar) |

**Service**: Servis Pendingin / Ganti Cairan Coolant

### 5. Suspensi bermasalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Mobil oleng / tidak stabil | Shockbreaker aus / mur roda longgar |
| Bunyi "buncit" dari bawah | Shockbreaker bocor / bushing suspensi |
| Setir bergetar saat kecepatan tinggi | Spooring off / ban tidak balance |
| Mobil miring ke satu sisi | Shockbreaker satu sisi habis |

**Service**: Spooring / Balancing / Ganti Shockbreaker

### 6. Kopling & transmisi

| Gejala | Kemungkinan penyebab |
|---|---|
| Kopling selip (rpm naik tapi laju tidak) | Kampas kopling habis |
| Kopling berat / susah injek | Cable kopling putus / silinder helper aus |
| Bunyi gemeretak waktu pindah gigi | Oli transmisi kurang / synchromesh aus |
| Gigi sulit masuk / macet | Transmissi bermasalah |

**Service**: Servis Kopling / Ganti Oli Transmisi

---

## Rules for Bot Response

1. **Selalu tekankan**: "Ini perkiraan awal ya mas/mbak — montir akan cek langsung untuk kepastian."
2. **Jangan janji**: Jangan bilang "pasti rem-nya" kalau hanya berdasarkan gejala.
3. **Arahkan ke service**: Jika gejala mengarah ke masalah spesifik → sarankan service terkait + tawarkan booking.
4. **Flag untuk montir**: Jika gejala ambiguous atau kompleks (misal: bunyi + overheat + rem + sospecha banyak), langsung escalate.
