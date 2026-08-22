const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
});

function showAlert(message, type = 'success') {
    if (type === 'error') {
        Swal.fire({ icon: 'error', title: 'แจ้งเตือน', text: message, confirmButtonText: 'ตกลง', confirmButtonColor: 'var(--danger-color)' });
    } else {
        Toast.fire({ icon: type, title: message });
    }
}

function showLoading() { document.getElementById('customLoader').style.display = 'flex'; }
function hideLoading() { document.getElementById('customLoader').style.display = 'none'; }

function switchLayout(mode) {
    if (mode === 'auth') { 
        document.getElementById('authLayout').style.display = 'block'; 
        document.getElementById('appLayout').style.display = 'none'; 
    } else { 
        document.getElementById('authLayout').style.display = 'none'; 
        document.getElementById('appLayout').style.display = 'flex'; 
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none'; 
    });
    
    const target = document.getElementById(sectionId);
    if(target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    
    if (['loginSection', 'signupSection', 'checkEligibilitySection', 'otpSection'].includes(sectionId)) {
        switchLayout('auth'); 
    } else {
        switchLayout('app');  
    }
}

// ตัวอย่างการทำ Login โดยใช้ fetch API (แทน google.script.run)
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('loginStudentId').value;
    const password = document.getElementById('loginPassword').value;
    
    // แบบใหม่ (ใช้ fetch)
    const res = await callBackendAPI('login', { studentId, password });
    if(res.success) {
        // จัดการเข้าสู่ระบบ
    } else {
        showAlert(res.message, 'error');
    }
});
