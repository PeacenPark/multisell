// ========================================
// Firebase 설정 (아래 부분을 채워주세요)
// ========================================

/**
 * Firebase Console에서 설정 정보를 가져와 아래에 입력하세요
 * 
 * 1. Firebase Console 접속: https://console.firebase.google.com
 * 2. 프로젝트 생성 또는 선택
 * 3. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가
 * 4. 아래 firebaseConfig 객체에 값 복사/붙여넣기
 */

const firebaseConfig = {
    apiKey: "AIzaSyDaeTs9wXNf-Ds_JTGNnV-hHDOvgFTHyhM",
  authDomain: "multisell-d0df0.firebaseapp.com",
  projectId: "multisell-d0df0",
  storageBucket: "multisell-d0df0.firebasestorage.app",
  messagingSenderId: "418356900394",
  appId: "1:418356900394:web:3c61d66e4cc5afa5588953",
  measurementId: "G-5XK10D2ERF"
};

// ========================================
// 전역 변수
// ========================================
let isFirebaseConfigured = false;
let auth = null;

// ========================================
// DOM 요소 (나중에 초기화)
// ========================================
let loginForm, signupForm, passwordResetForm;
let loginBtn, signupBtn, resetBtn;
let showSignup, showLogin, showPasswordReset, backToLogin;
let authLoading, authError, authSuccess;

// ========================================
// 메시지 표시 함수 (먼저 정의)
// ========================================

function showLoading() {
    if (authLoading) {
        authLoading.style.display = 'block';
        hideMessages();
    }
}

function hideLoading() {
    if (authLoading) {
        authLoading.style.display = 'none';
    }
}

function showError(message) {
    if (authError) {
        authError.textContent = message;
        authError.style.display = 'block';
    }
    if (authSuccess) {
        authSuccess.style.display = 'none';
    }
    hideLoading();
}

function showSuccess(message) {
    if (authSuccess) {
        authSuccess.textContent = message;
        authSuccess.style.display = 'block';
    }
    if (authError) {
        authError.style.display = 'none';
    }
    hideLoading();
}

function hideMessages() {
    if (authError) authError.style.display = 'none';
    if (authSuccess) authSuccess.style.display = 'none';
}

// ========================================
// 폼 전환
// ========================================

function showForm(formToShow) {
    if (loginForm) loginForm.classList.remove('active');
    if (signupForm) signupForm.classList.remove('active');
    if (passwordResetForm) passwordResetForm.classList.remove('active');
    
    if (formToShow) {
        formToShow.classList.add('active');
    }
    
    hideMessages();
}

// ========================================
// 에러 메시지 번역
// ========================================

function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
        'auth/invalid-email': '유효하지 않은 이메일 주소입니다.',
        'auth/operation-not-allowed': '이메일/비밀번호 로그인이 비활성화되어 있습니다.',
        'auth/weak-password': '비밀번호는 최소 6자 이상이어야 합니다.',
        'auth/user-disabled': '비활성화된 계정입니다.',
        'auth/user-not-found': '존재하지 않는 계정입니다.',
        'auth/wrong-password': '잘못된 비밀번호입니다.',
        'auth/too-many-requests': '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
        'auth/network-request-failed': '네트워크 오류가 발생했습니다.',
        'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
        'auth/cancelled-popup-request': '이미 로그인 창이 열려있습니다.',
        'auth/invalid-credential': '잘못된 인증 정보입니다.',
        'auth/account-exists-with-different-credential': '이미 다른 방법으로 가입된 이메일입니다.'
    };
    
    return errorMessages[errorCode] || '오류가 발생했습니다. 다시 시도해주세요.';
}

// ========================================
// 유효성 검사
// ========================================

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 8;
}

// ========================================
// Firebase 초기화
// ========================================

function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase SDK가 로드되지 않았습니다.');
            showError('Firebase SDK 로드 실패. 페이지를 새로고침해주세요.');
            return false;
        }

        if (firebaseConfig.apiKey && firebaseConfig.projectId) {
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            isFirebaseConfigured = true;
            console.log('✅ Firebase 초기화 성공');
            return true;
        } else {
            console.warn('⚠️ Firebase 설정이 필요합니다.');
            showError('⚠️ Firebase 설정이 필요합니다.\n\n📖 SETUP_GUIDE.md 파일을 참고하여 Firebase 프로젝트를 생성하고 설정을 입력해주세요.');
            return false;
        }
    } catch (error) {
        console.error('❌ Firebase 초기화 실패:', error);
        showError('Firebase 초기화 실패: ' + error.message);
        return false;
    }
}

// ========================================
// 이메일 로그인
// ========================================

async function handleEmailLogin() {
    if (!isFirebaseConfigured || !auth) {
        showError('⚠️ Firebase 설정이 필요합니다.\n\n📖 SETUP_GUIDE.md 파일을 참고하세요.');
        return;
    }

    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
        showError('이메일과 비밀번호를 입력해주세요.');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('유효한 이메일 주소를 입력해주세요.');
        return;
    }
    
    showLoading();
    if (loginBtn) loginBtn.disabled = true;
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('✅ 로그인 성공:', userCredential.user.uid);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('❌ 로그인 실패:', error);
        showError(getErrorMessage(error.code));
        if (loginBtn) loginBtn.disabled = false;
    }
}

// ========================================
// 이메일 회원가입
// ========================================

async function handleEmailSignup() {
    if (!isFirebaseConfigured || !auth) {
        showError('⚠️ Firebase 설정이 필요합니다.\n\n📖 SETUP_GUIDE.md 파일을 참고하세요.');
        return;
    }

    const name = document.getElementById('signupName')?.value.trim();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm')?.value;
    
    if (!name || !email || !password || !passwordConfirm) {
        showError('모든 항목을 입력해주세요.');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('유효한 이메일 주소를 입력해주세요.');
        return;
    }
    
    if (!validatePassword(password)) {
        showError('비밀번호는 최소 8자 이상이어야 합니다.');
        return;
    }
    
    if (password !== passwordConfirm) {
        showError('비밀번호가 일치하지 않습니다.');
        return;
    }
    
    showLoading();
    if (signupBtn) signupBtn.disabled = true;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('✅ 회원가입 성공:', user.uid);
        
        await user.updateProfile({
            displayName: name
        });
        
        showSuccess('회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('❌ 회원가입 실패:', error);
        showError(getErrorMessage(error.code));
        if (signupBtn) signupBtn.disabled = false;
    }
}

// ========================================
// 비밀번호 재설정
// ========================================

async function handlePasswordReset() {
    if (!isFirebaseConfigured || !auth) {
        showError('⚠️ Firebase 설정이 필요합니다.\n\n📖 SETUP_GUIDE.md 파일을 참고하세요.');
        return;
    }

    const email = document.getElementById('resetEmail')?.value.trim();
    
    if (!email) {
        showError('이메일을 입력해주세요.');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('유효한 이메일 주소를 입력해주세요.');
        return;
    }
    
    showLoading();
    if (resetBtn) resetBtn.disabled = true;
    
    try {
        await auth.sendPasswordResetEmail(email);
        
        showSuccess('비밀번호 재설정 이메일을 발송했습니다. 이메일을 확인해주세요.');
        
        setTimeout(() => {
            showForm(loginForm);
            if (resetBtn) resetBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error('❌ 비밀번호 재설정 실패:', error);
        showError(getErrorMessage(error.code));
        if (resetBtn) resetBtn.disabled = false;
    }
}

// ========================================
// DOM 로드 완료 후 초기화
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM 로드 완료');
    
    // DOM 요소 가져오기
    loginForm = document.getElementById('loginForm');
    signupForm = document.getElementById('signupForm');
    passwordResetForm = document.getElementById('passwordResetForm');
    
    loginBtn = document.getElementById('loginBtn');
    signupBtn = document.getElementById('signupBtn');
    resetBtn = document.getElementById('resetBtn');
    
    showSignup = document.getElementById('showSignup');
    showLogin = document.getElementById('showLogin');
    showPasswordReset = document.getElementById('showPasswordReset');
    backToLogin = document.getElementById('backToLogin');
    
    authLoading = document.getElementById('authLoading');
    authError = document.getElementById('authError');
    authSuccess = document.getElementById('authSuccess');
    
    // Firebase 초기화
    const firebaseReady = initializeFirebase();
    
    // 폼 전환 이벤트
    if (showSignup) {
        showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            showForm(signupForm);
        });
    }
    
    if (showLogin) {
        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showForm(loginForm);
        });
    }
    
    if (showPasswordReset) {
        showPasswordReset.addEventListener('click', (e) => {
            e.preventDefault();
            showForm(passwordResetForm);
        });
    }
    
    if (backToLogin) {
        backToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showForm(loginForm);
        });
    }
    
    // 로그인 버튼
    if (loginBtn) {
        loginBtn.addEventListener('click', handleEmailLogin);
    }
    
    // Enter 키로 로그인
    const loginPasswordInput = document.getElementById('loginPassword');
    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleEmailLogin();
            }
        });
    }
    
    // 회원가입 버튼
    if (signupBtn) {
        signupBtn.addEventListener('click', handleEmailSignup);
    }
    
    // 비밀번호 재설정 버튼
    if (resetBtn) {
        resetBtn.addEventListener('click', handlePasswordReset);
    }
    
    // 인증 상태 확인
    if (firebaseReady && auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('✅ 이미 로그인됨:', user.uid);
                window.location.href = 'index.html';
            }
        });
    }
    
    console.log('✅ 초기화 완료');
});

// ========================================
// Firebase Authentication 설정 가이드
// ========================================

console.log(`
========================================
🔧 Firebase Authentication 설정 가이드
========================================

⚠️ 현재 Firebase가 설정되지 않았습니다!

📖 SETUP_GUIDE.md 파일을 열어 단계별 설정 방법을 확인하세요.

간단 요약:
1. Firebase Console 접속 (https://console.firebase.google.com)
2. 프로젝트 생성
3. Authentication 활성화 (이메일/비밀번호)
4. Firestore Database 생성
5. 웹 앱 구성 정보 복사
6. auth.js와 script.js의 firebaseConfig에 붙여넣기

설정 완료 후 페이지를 새로고침하세요!
========================================
`);