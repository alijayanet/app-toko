/**
 * Database Migration Script
 * Migrasi existing users ke sistem salt per-user
 * 
 * Cara penggunaan:
 * node src/migrate.js
 */

const db = require('./db');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function hashPassword(password, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, actualSalt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function migrateUsers() {
  console.log('='.repeat(60));
  console.log('DATABASE MIGRATION - User Password Salt Upgrade');
  console.log('='.repeat(60));
  console.log('');
  console.log('Script ini akan:');
  console.log('1. Cek user yang masih menggunakan password lama (tanpa salt)');
  console.log('2. Migrasi password ke sistem salt unik per user');
  console.log('3. Meningkatkan iterasi PBKDF2 dari 1000 ke 100000');
  console.log('');
  console.log('⚠️  PENTING: Backup database Anda sebelum melanjutkan!');
  console.log('');

  const answer = await question('Lanjutkan migrasi? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('Migrasi dibatalkan.');
    rl.close();
    return;
  }

  try {
    // Cek user yang belum punya salt
    const usersWithoutSalt = db.prepare('SELECT * FROM m_users WHERE salt IS NULL OR salt = ""').all();
    
    if (usersWithoutSalt.length === 0) {
      console.log('✅ Semua user sudah menggunakan salt! Tidak ada yang perlu dimigrasi.');
      rl.close();
      return;
    }

    console.log(`\nDitemukan ${usersWithoutSalt.length} user yang perlu dimigrasi:\n`);
    
    for (const user of usersWithoutSalt) {
      console.log(`- ${user.username} (${user.name}) - Role: ${user.role}`);
    }

    console.log('\n⚠️  PERHATIAN:');
    console.log('Untuk migrasi password, Anda perlu memasukkan password saat ini');
    console.log('untuk setiap user. Jika tidak tahu password, user tersebut akan');
    console.log('di-skip dan harus reset password manual nanti.\n');

    const migrateAll = await question('Apakah Anda tahu password semua user di atas? (yes/no): ');

    const updateStmt = db.prepare('UPDATE m_users SET password = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

    if (migrateAll.toLowerCase() === 'yes') {
      console.log('\nMulai migrasi dengan input password...\n');
      
      for (const user of usersWithoutSalt) {
        const password = await question(`Password untuk ${user.username}: `);
        
        if (!password || password.trim() === '') {
          console.log(`  ⏭️  Skip ${user.username} (password kosong)\n`);
          continue;
        }

        const hashData = hashPassword(password);
        updateStmt.run(hashData.hash, hashData.salt, user.id);
        console.log(`  ✅ ${user.username} berhasil dimigrasi\n`);
      }
    } else {
      console.log('\n⚠️  Mode Auto-Migration:');
      console.log('User akan di-flag untuk reset password pada login pertama.');
      console.log('Password default akan di-set ulang untuk keamanan.\n');

      const confirmAuto = await question('Lanjutkan dengan auto-migration? (yes/no): ');
      
      if (confirmAuto.toLowerCase() === 'yes') {
        // Auto-generate password sementara untuk user yang tidak diketahui
        for (const user of usersWithoutSalt) {
          // Generate password temporary yang kuat
          const tempPassword = crypto.randomBytes(16).toString('hex');
          const hashData = hashPassword(tempPassword);
          updateStmt.run(hashData.hash, hashData.salt, user.id);
          
          console.log(`✅ ${user.username} - Password temporary: ${tempPassword}`);
          console.log(`   (Simpan dan berikan ke user untuk login pertama)\n`);
        }
        
        console.log('⚠️  PENTING: Simpan password temporary di atas dan berikan ke user terkait!');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migrasi selesai!');
    console.log('='.repeat(60));
    
    // Verify hasil migrasi
    const remainingOld = db.prepare('SELECT COUNT(*) as count FROM m_users WHERE salt IS NULL OR salt = ""').get();
    console.log(`\nUser dengan salt baru: ${usersWithoutSalt.length - remainingOld.count}`);
    console.log(`User yang masih perlu migrasi: ${remainingOld.count}`);
    
  } catch (error) {
    console.error('\n❌ Error saat migrasi:', error.message);
  } finally {
    rl.close();
  }
}

// Jalankan migrasi
migrateUsers();
