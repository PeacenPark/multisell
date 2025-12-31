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
    apiKey: "",                      // 여기에 입력
    authDomain: "",                  // 여기에 입력
    projectId: "",                   // 여기에 입력
    storageBucket: "",               // 여기에 입력
    messagingSenderId: "",           // 여기에 입력
    appId: ""                        // 여기에 입력
};

// Firebase 초기화
let isFirebaseConfigured = false;

try {
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        firebase.initializeApp(firebaseConfig);
        isFirebaseConfigured = true;
        console.log('✅ Firebase 초기화 성공');
    } else {
        console.warn('⚠️ Firebase 설정이 필요합니다. firebaseConfig를 입력해주세요.');
        showError('Firebase 설정이 필요합니다. 관리자에게 문의하세요.');
    }
} catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    showError('Firebase 초기화에 실패했습니다.');
}

// ========================================
// Firebase Authentication
// ========================================

const auth = firebase.auth();

// Google 로그인 프로바이더
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// ========================================
// DOM 요소
// ========================================

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const passwordResetForm = document.getElementById('passwordResetForm');

const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const resetBtn = document.getElementById('resetBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');

const showSignup = document.getElementById('showSignup');
const showLogin = document.getElementById('showLogin');
const showPasswordReset = document.getElementById('showPasswordReset');
const backToLogin = document.getElementById('backToLogin');

const authLoading = document.getElementById('authLoading');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');

// ========================================
// 폼 전환
// ========================================

function showForm(formToShow) {
    // 모든 폼 숨기기
    loginForm.classList.remove('active');
    signupForm.classList.remove('active');
    passwordResetForm.classList.remove('active');
    
    // 선택한 폼만 표시
    formToShow.classList.add('active');
    
    // 메시지 초기화
    hideMessages();
}

showSignup.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(signupForm);
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(loginForm);
});

showPasswordReset.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(passwordResetForm);
});

backToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showForm(loginForm);
});

// ========================================
// 메시지 표시 함수
// ========================================

function showLoading() {
    authLoading.style.display = 'block';
    hideMessages();
}

function hideLoading() {
    authLoading.style.display = 'none';
}

function showError(message) {
    authError.textContent = message;
    authError.style.display = 'block';
    authSuccess.style.display = 'none';
    hideLoading();
}

function showSuccess(message) {
    authSuccess.textContent = message;
    authSuccess.style.display = 'block';
    authError.style.display = 'none';
    hideLoading();
}

function hideMessages() {
    authError.style.display = 'none';
    authSuccess.style.display = 'none';
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
// 이메일 로그인
// ========================================

loginBtn.addEventListener('click', async () => {
    if (!isFirebaseConfigured) {
        showError('Firebase 설정이 필요합니다.');
        return;
    }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // 유효성 검사
    if (!email || !password) {
        showError('이메일과 비밀번호를 입력해주세요.');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('유효한 이메일 주소를 입력해주세요.');
        return;
    }
    
    showLoading();
    loginBtn.disabled = true;
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('✅ 로그인 성공:', userCredential.user.uid);
        
        // 메인 페이지로 리디렉션
        window.location.href = 'index.html';
    } catch (error) {
        console.error('❌ 로그인 실패:', error);
        showError(getErrorMessage(error.code));
        loginBtn.disabled = false;
    }
});

// Enter 키로 로그인
document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

// ========================================
// 이메일 회원가입
// ========================================

signupBtn.addEventListener('click', async () => {
    if (!isFirebaseConfigured) {
        showError('Firebase 설정이 필요합니다.');
        return;
    }

    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    
    // 유효성 검사
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
    signupBtn.disabled = true;
    
    try {
        // 계정 생성
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('✅ 회원가입 성공:', user.uid);
        
        // 사용자 프로필 업데이트
        await user.updateProfile({
            displayName: name
        });
        
        // 이메일 인증 발송 (선택사항)
        // await user.sendEmailVerification();
        
        showSuccess('회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.');
        
        // 2초 후 메인 페이지로 리디렉션
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('❌ 회원가입 실패:', error);
        showError(getErrorMessage(error.code));
        signupBtn.disabled = false;
    }
});

// ========================================
// Google 로그인
// ========================================

async function signInWithGoogle() {
    if (!isFirebaseConfigured) {
        showError('Firebase 설정이 필요합니다.');
        return;
    }

    showLoading();
    
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        
        console.log('✅ Google 로그인 성공:', user.uid);
        console.log('사용자 정보:', {
            name: user.displayName,
            email: user.email,
            photo: user.photoURL
        });
        
        // 메인 페이지로 리디렉션
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('❌ Google 로그인 실패:', error);
        
        if (error.code !== 'auth/popup-closed-by-user' && 
            error.code !== 'auth/cancelled-popup-request') {
            showError(getErrorMessage(error.code));
        } else {
            hideLoading();
        }
    }
}

googleLoginBtn.addEventListener('click', signInWithGoogle);
googleSignupBtn.addEventListener('click', signInWithGoogle);

// ========================================
// 비밀번호 재설정
// ========================================

resetBtn.addEventListener('click', async () => {
    if (!isFirebaseConfigured) {
        showError('Firebase 설정이 필요합니다.');
        return;
    }

    const email = document.getElementById('resetEmail').value.trim();
    
    if (!email) {
        showError('이메일을 입력해주세요.');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('유효한 이메일 주소를 입력해주세요.');
        return;
    }
    
    showLoading();
    resetBtn.disabled = true;
    
    try {
        await auth.sendPasswordResetEmail(email);
        
        showSuccess('비밀번호 재설정 이메일을 발송했습니다. 이메일을 확인해주세요.');
        
        // 3초 후 로그인 폼으로 전환
        setTimeout(() => {
            showForm(loginForm);
            resetBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error('❌ 비밀번호 재설정 실패:', error);
        showError(getErrorMessage(error.code));
        resetBtn.disabled = false;
    }
});

// ========================================
// 인증 상태 확인
// ========================================

auth.onAuthStateChanged((user) => {
    if (user) {
        // 이미 로그인된 경우 메인 페이지로 리디렉션
        console.log('✅ 이미 로그인됨:', user.uid);
        window.location.href = 'index.html';
    }
});

// ========================================
// Firebase Authentication 설정 가이드
// ========================================

console.log(`
========================================
🔧 Firebase Authentication 설정 가이드
========================================

1. Firebase Console 접속
   https://console.firebase.google.com

2. 프로젝트 생성 또는 선택

3. Authentication 활성화
   - Build > Authentication > Get Started
   - Sign-in method 탭으로 이동
   
4. 로그인 방법 활성화
   ✅ Email/Password: 사용 설정
   ✅ Google: 사용 설정
   
5. 웹 앱 구성 정보 가져오기
   - 프로젝트 설정 > 일반
   - 내 앱 > 웹 앱 추가 (</>)
   - firebaseConfig 복사
   
6. auth.js 파일 수정
   - firebaseConfig 객체에 값 붙여넣기
   
7. Firestore Database 생성
   - Build > Firestore Database > Create database
   - 테스트 모드로 시작 (나중에 보안 규칙 설정)
   
8. 보안 규칙 설정 (중요!)
   - Firestore Database > Rules 탭
   - 아래 규칙 복사/붙여넣기:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
  }
}

9. script.js 파일 수정
   - firebaseConfig 동일하게 입력

========================================
`);
