// ========================================
// Firebase 설정
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyDaeTs9wXNf-Ds_JTGNnV-hHDOvgFTHyhM",
    authDomain: "multisell-d0df0.firebaseapp.com",
    projectId: "multisell-d0df0",
    storageBucket: "multisell-d0df0.firebasestorage.app",
    messagingSenderId: "418356900394",
    appId: "1:418356900394:web:3c61d66e4cc5afa5588953",
    measurementId: "G-5XK10D2ERF"
};

// Firebase 초기화
let db = null;
let auth = null;
let isFirebaseEnabled = false;
let currentUser = null;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    isFirebaseEnabled = true;
    console.log('✅ Firebase 연결 성공');
} catch (error) {
    console.error('❌ Firebase 초기화 오류:', error);
}

// 전역 변수
let transactions = [];
let exchangeRates = {}; // 환율 데이터 저장
let lastExchangeRateUpdate = null; // 마지막 업데이트 시간
let encryptionKey = null; // 암호화 키 (비밀번호 기반)
let isFormInitialized = false; // 폼 초기화 플래그 (이벤트 리스너 중복 방지)
let isAppInitialized = false; // 앱 초기화 플래그 (onAuthStateChanged 중복 실행 방지)
let isModalInitialized = false; // 모달 초기화 플래그
let isButtonsInitialized = false; // 버튼 초기화 플래그
let isTabsInitialized = false; // 탭 초기화 플래그
let isSigningUp = false; // 회원가입 중 플래그
let isSubmitting = false; // 폼 제출 중 플래그

// 디버깅 카운터
let initializeAppCallCount = 0;
let onAuthStateChangedCallCount = 0;
let formSubmitCallCount = 0;

// 관리자 이메일 설정 (이 이메일들만 다른 사용자를 승인할 수 있음)
const ADMIN_EMAILS = [
    'jisa861@gmail.com',  // 여기에 관리자 이메일 추가
    // 'admin2@example.com',  // 추가 관리자가 필요하면 여기 추가
];

// 현재 사용자가 관리자인지 확인
function isAdmin(email) {
    return ADMIN_EMAILS.includes(email);
}

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    // 인증 상태 감시 시작
    initializeAuth();
});

// ========================================
// 암호화 관련 함수
// ========================================

// 비밀번호에서 암호화 키 생성
function generateEncryptionKey(password, email = null) {
    // PBKDF2를 사용하여 비밀번호에서 키 생성
    // 솔트는 사용자 이메일로 고정 (일관성 유지)
    const salt = email || (auth.currentUser ? auth.currentUser.email : 'default-salt');
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256/32,
        iterations: 1000
    });
    console.log('🔑 암호화 키 생성, salt:', salt);
    return key.toString();
}

// 데이터 암호화
function encryptData(data) {
    if (!encryptionKey) {
        console.warn('⚠️ 암호화 키가 없습니다. 데이터를 평문으로 저장합니다.');
        return data;
    }
    
    try {
        const jsonString = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(jsonString, encryptionKey).toString();
        return encrypted;
    } catch (error) {
        console.error('❌ 암호화 오류:', error);
        throw error;
    }
}

// 데이터 복호화
function decryptData(encryptedData) {
    if (!encryptionKey) {
        console.warn('⚠️ 암호화 키가 없습니다. 복호화 불가능.');
        console.log('💡 힌트: 로그인 시 암호화 키가 생성되었는지 확인하세요.');
        return null;
    }
    
    try {
        console.log('🔓 복호화 시도 중... (암호화 키 길이:', encryptionKey.length, ')');
        const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
        const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
        
        if (!jsonString) {
            console.error('❌ 복호화 실패: 빈 문자열 반환');
            console.error('   원인: 잘못된 비밀번호 또는 다른 환경에서 생성된 데이터');
            console.log('💡 해결: 로컬과 배포 페이지에서 같은 비밀번호를 사용했는지 확인');
            return null;
        }
        
        console.log('✅ 복호화 성공, JSON 길이:', jsonString.length);
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('❌ 복호화 오류:', error.message);
        console.error('   암호화 키:', encryptionKey.substring(0, 20) + '...');
        return null;
    }
}

// ========================================
// 인증 관련 함수
// ========================================

// 인증 초기화
function initializeAuth() {
    // 인증 상태 변경 감지
    auth.onAuthStateChanged(async (user) => {
        onAuthStateChangedCallCount++;
        console.log(`🔄 onAuthStateChanged 트리거 #${onAuthStateChangedCallCount}, user:`, user ? user.email : 'null', 'isSigningUp:', isSigningUp);
        
        if (user) {
            // 회원가입 중에는 앱 초기화 건너뛰기
            if (isSigningUp) {
                console.log('⏭️ 회원가입 중이므로 앱 초기화 건너뜀');
                return;
            }
            
            // 로그인 상태
            currentUser = user;
            
            console.log('✅ 로그인됨:', user.email, '상호명:', user.displayName);
            
            // Firestore에서 사용자 승인 상태 확인
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    console.log('📄 사용자 정보:', userData);
                    
                    // 승인 여부 확인
                    if (!userData.approved) {
                        console.warn('⚠️ 승인 대기 중인 사용자');
                        alert('⚠️ 승인 대기 중입니다.\n\n관리자 승인 후 로그인할 수 있습니다.\n승인 상태는 관리자에게 문의해주세요.');
                        await auth.signOut();
                        return;
                    }
                    
                    console.log('✅ 승인된 사용자, 관리자:', userData.isAdmin);
                } else {
                    console.warn('⚠️ Firestore에 사용자 정보 없음');
                }
            } catch (error) {
                console.error('❌ 사용자 승인 상태 확인 오류:', error);
            }
            
            // 세션 스토리지에서 암호화 키 복원
            const savedKey = sessionStorage.getItem('encKey');
            if (savedKey) {
                encryptionKey = savedKey;
                console.log('✅ 암호화 키 복원됨');
            } else {
                console.warn('⚠️ 암호화 키가 없습니다. 데이터를 복호화할 수 없습니다.');
            }
            
            // 로그인 화면 숨기기, 앱 화면 보이기
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            
            // 사용자 이메일 표시
            document.getElementById('userEmail').textContent = user.email;
            
            // 앱 초기화
            console.log('📱 initializeApp 호출 시작');
            await initializeApp();
            console.log('📱 initializeApp 호출 완료');
        } else {
            // 로그아웃 상태
            currentUser = null;
            console.log('❌ 로그아웃됨');
            
            // 모든 초기화 플래그 리셋
            isFormInitialized = false;
            isModalInitialized = false;
            isButtonsInitialized = false;
            isTabsInitialized = false;
            isAppInitialized = false;
            
            // 카운터 리셋
            initializeAppCallCount = 0;
            formSubmitCallCount = 0;
            
            console.log('🔄 모든 초기화 플래그 및 카운터 리셋됨');
            
            // 앱 화면 숨기기, 로그인 화면 보이기
            document.getElementById('authContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
        }
    });
    
    // 인증 탭 전환
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.authTab;
            
            // 모든 탭 비활성화
            authTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            // 선택된 탭 활성화
            tab.classList.add('active');
            if (targetTab === 'login') {
                document.getElementById('loginForm').classList.add('active');
            } else {
                document.getElementById('signupForm').classList.add('active');
            }
            
            // 에러 메시지 초기화
            document.getElementById('loginError').textContent = '';
            document.getElementById('signupError').textContent = '';
        });
    });
    
    // 로그인 화면 표시 함수 (회원가입 후 사용)
    window.showLoginScreen = function() {
        // 모든 탭 비활성화
        authTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        // 로그인 탭 활성화
        document.querySelector('[data-auth-tab="login"]').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
        
        // 에러 메시지 초기화
        document.getElementById('loginError').textContent = '';
        document.getElementById('signupError').textContent = '';
    };
    
    // 로그인 폼 제출
    document.getElementById('loginFormSubmit').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorElement = document.getElementById('loginError');
        
        try {
            errorElement.textContent = '';
            await auth.signInWithEmailAndPassword(email, password);
            
            // 로그인 성공 후 암호화 키 생성 및 세션 스토리지에 저장
            // 이메일을 직접 전달하여 auth.currentUser 타이밍 문제 방지
            encryptionKey = generateEncryptionKey(password, email);
            sessionStorage.setItem('encKey', encryptionKey);
            console.log('✅ 로그인 성공 및 암호화 키 생성, email:', email);
        } catch (error) {
            console.error('❌ 로그인 오류:', error);
            errorElement.textContent = getAuthErrorMessage(error.code);
        }
    });
    
    // 비밀번호 찾기 링크
    document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = prompt('가입하신 이메일 주소를 입력하세요:');
        
        if (email) {
            try {
                await auth.sendPasswordResetEmail(email);
                alert('비밀번호 재설정 이메일을 발송했습니다.\n이메일을 확인해주세요.');
            } catch (error) {
                console.error('❌ 비밀번호 재설정 오류:', error);
                if (error.code === 'auth/user-not-found') {
                    alert('존재하지 않는 이메일입니다.');
                } else if (error.code === 'auth/invalid-email') {
                    alert('유효하지 않은 이메일 주소입니다.');
                } else {
                    alert('비밀번호 재설정 이메일 발송에 실패했습니다.');
                }
            }
        }
    });
    
    // 회원가입 폼 제출
    document.getElementById('signupFormSubmit').addEventListener('submit', async (e) => {
        e.preventDefault();
        const businessName = document.getElementById('signupBusinessName').value.trim();
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
        const errorElement = document.getElementById('signupError');
        
        // 비밀번호 확인
        if (password !== passwordConfirm) {
            errorElement.textContent = '비밀번호가 일치하지 않습니다.';
            return;
        }
        
        // 상호명 확인
        if (!businessName) {
            errorElement.textContent = '상호명을 입력해주세요.';
            return;
        }
        
        try {
            errorElement.textContent = '';
            
            console.log('📝 회원가입 시작:', email);
            
            // 회원가입 플래그 설정
            isSigningUp = true;
            
            // 회원가입
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            console.log('✅ 계정 생성 완료');
            
            // 상호명(displayName)을 프로필에 저장
            await userCredential.user.updateProfile({
                displayName: businessName
            });
            console.log('✅ 상호명 저장 완료:', businessName);
            
            // Firestore에 사용자 정보 저장 (승인 상태 포함)
            const isUserAdmin = isAdmin(email);
            try {
                await db.collection('users').doc(userCredential.user.uid).set({
                    email: email,
                    businessName: businessName,
                    approved: isUserAdmin, // 관리자는 자동 승인, 일반 사용자는 대기
                    isAdmin: isUserAdmin,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    approvedAt: isUserAdmin ? firebase.firestore.FieldValue.serverTimestamp() : null,
                    approvedBy: isUserAdmin ? email : null
                });
                console.log('✅ 사용자 정보 Firestore 저장 완료, 승인상태:', isUserAdmin ? '자동승인' : '대기중');
            } catch (error) {
                console.error('❌ Firestore 사용자 정보 저장 실패:', error);
            }
            
            // 폼 초기화
            document.getElementById('signupFormSubmit').reset();
            
            // 즉시 로그아웃 (사용자가 직접 로그인하도록)
            console.log('🚪 즉시 로그아웃 실행');
            await auth.signOut();
            console.log('✅ 로그아웃 완료');
            
            // 회원가입 플래그 해제
            isSigningUp = false;
            
            // 로그인 화면으로 전환
            showLoginScreen();
            
            // 성공 메시지 표시 (승인 상태에 따라)
            if (isUserAdmin) {
                alert(`회원가입이 완료되었습니다!\n이메일: ${email}\n상호명: ${businessName}\n\n관리자 계정이므로 바로 로그인할 수 있습니다.`);
            } else {
                alert(`회원가입 신청이 완료되었습니다!\n이메일: ${email}\n상호명: ${businessName}\n\n⚠️ 관리자 승인 후 로그인할 수 있습니다.\n승인 상태는 관리자에게 문의해주세요.`);
            }
            
            // 로그인 이메일 자동 입력
            document.getElementById('loginEmail').value = email;
            
        } catch (error) {
            console.error('❌ 회원가입 오류:', error);
            errorElement.textContent = getAuthErrorMessage(error.code);
            
            // 에러 발생 시에도 플래그 해제
            isSigningUp = false;
        }
    });
    
    // 로그아웃 버튼
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (confirm('로그아웃하시겠습니까?')) {
            try {
                await auth.signOut();
                console.log('✅ 로그아웃 성공');
                
                // 데이터 및 암호화 키 초기화
                transactions = [];
                encryptionKey = null;
                sessionStorage.removeItem('encKey');
                
                // 모든 초기화 플래그 리셋
                isFormInitialized = false;
                isModalInitialized = false;
                isButtonsInitialized = false;
                isTabsInitialized = false;
                isAppInitialized = false;
                
                // 폼 초기화
                document.getElementById('loginFormSubmit').reset();
            } catch (error) {
                console.error('❌ 로그아웃 오류:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            }
        }
    });
    
    // 계정 정보 모달 열기
    document.getElementById('accountInfoBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (user) {
            // 현재 정보 표시
            document.getElementById('accountEmail').textContent = user.email;
            document.getElementById('newBusinessName').value = user.displayName || '';
            
            // 메시지 초기화
            document.getElementById('businessNameMessage').textContent = '';
            document.getElementById('businessNameMessage').className = 'form-message';
            document.getElementById('passwordMessage').textContent = '';
            document.getElementById('passwordMessage').className = 'form-message';
            
            // 비밀번호 폼 초기화
            document.getElementById('updatePasswordForm').reset();
            
            // 관리자인 경우 승인 관리 섹션 표시
            if (isAdmin(user.email)) {
                document.getElementById('approvalSection').style.display = 'block';
                await loadPendingUsers();
            } else {
                document.getElementById('approvalSection').style.display = 'none';
            }
            
            // 모달 열기
            document.getElementById('accountInfoModal').style.display = 'flex';
        }
    });
    
    // 계정 정보 모달 닫기
    document.querySelector('.account-close').addEventListener('click', () => {
        document.getElementById('accountInfoModal').style.display = 'none';
    });
    
    // 상호명 변경
    document.getElementById('updateBusinessNameForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newBusinessName = document.getElementById('newBusinessName').value.trim();
        const messageElement = document.getElementById('businessNameMessage');
        
        if (!newBusinessName) {
            messageElement.textContent = '상호명을 입력해주세요.';
            messageElement.className = 'form-message error';
            return;
        }
        
        try {
            const user = auth.currentUser;
            await user.updateProfile({
                displayName: newBusinessName
            });
            
            // 헤더 업데이트
            document.getElementById('userBusinessName').textContent = newBusinessName;
            
            messageElement.textContent = '상호명이 변경되었습니다.';
            messageElement.className = 'form-message success';
            
            console.log('✅ 상호명 변경 성공');
        } catch (error) {
            console.error('❌ 상호명 변경 오류:', error);
            messageElement.textContent = '상호명 변경에 실패했습니다.';
            messageElement.className = 'form-message error';
        }
    });
    
    // 비밀번호 변경
    document.getElementById('updatePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const newPasswordConfirm = document.getElementById('newPasswordConfirm').value;
        const messageElement = document.getElementById('passwordMessage');
        
        // 비밀번호 확인
        if (newPassword !== newPasswordConfirm) {
            messageElement.textContent = '새 비밀번호가 일치하지 않습니다.';
            messageElement.className = 'form-message error';
            return;
        }
        
        try {
            const user = auth.currentUser;
            const credential = firebase.auth.EmailAuthProvider.credential(
                user.email,
                currentPassword
            );
            
            // 재인증
            await user.reauthenticateWithCredential(credential);
            
            // 비밀번호 변경
            await user.updatePassword(newPassword);
            
            messageElement.textContent = '비밀번호가 변경되었습니다.';
            messageElement.className = 'form-message success';
            
            // 폼 초기화
            document.getElementById('updatePasswordForm').reset();
            
            console.log('✅ 비밀번호 변경 성공');
        } catch (error) {
            console.error('❌ 비밀번호 변경 오류:', error);
            if (error.code === 'auth/wrong-password') {
                messageElement.textContent = '현재 비밀번호가 올바르지 않습니다.';
            } else if (error.code === 'auth/weak-password') {
                messageElement.textContent = '새 비밀번호가 너무 약합니다.';
            } else {
                messageElement.textContent = '비밀번호 변경에 실패했습니다.';
            }
            messageElement.className = 'form-message error';
        }
    });
    
    // 회원탈퇴 버튼
    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
        const confirmMessage = '정말로 회원탈퇴하시겠습니까?\n\n모든 데이터가 삭제되며 복구할 수 없습니다.';
        
        if (confirm(confirmMessage)) {
            const doubleConfirm = prompt('회원탈퇴를 진행하려면 "탈퇴"를 입력하세요:');
            
            if (doubleConfirm === '탈퇴') {
                try {
                    const user = auth.currentUser;
                    const userId = user.uid;
                    
                    console.log('🗑️ 회원탈퇴 시작, 사용자 UID:', userId);
                    
                    // 1. 메모리 데이터 초기화
                    transactions = [];
                    encryptionKey = null;
                    
                    // 2. 세션 스토리지 삭제
                    sessionStorage.clear();
                    console.log('✅ 세션 스토리지 삭제 완료');
                    
                    // 3. 로컬스토리지 데이터 삭제
                    try {
                        // 현재 사용자 데이터 삭제
                        localStorage.removeItem(`overseasTransactions_${userId}`);
                        localStorage.removeItem(`customBrands_${userId}`);
                        localStorage.removeItem(`customSites_${userId}`);
                        
                        // 혹시 모를 다른 키 패턴도 삭제
                        const keysToRemove = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && (
                                key.includes(userId) || 
                                key.startsWith('overseasTransactions_') ||
                                key.startsWith('customBrands_') ||
                                key.startsWith('customSites_')
                            )) {
                                keysToRemove.push(key);
                            }
                        }
                        
                        keysToRemove.forEach(key => {
                            localStorage.removeItem(key);
                            console.log('🗑️ 로컬스토리지 삭제:', key);
                        });
                        
                        console.log('✅ 로컬스토리지 데이터 삭제 완료');
                    } catch (error) {
                        console.error('⚠️ 로컬스토리지 삭제 오류:', error);
                    }
                    
                    // 4. Firebase 데이터 삭제 시도 (실패해도 계속 진행)
                    if (isFirebaseEnabled) {
                        try {
                            // 거래 데이터 삭제
                            const transactionsSnapshot = await db.collection('transactions')
                                .where('userId', '==', userId)
                                .get();
                            
                            const deletePromises = [];
                            transactionsSnapshot.forEach(doc => {
                                deletePromises.push(doc.ref.delete().catch(err => {
                                    console.warn('⚠️ 거래 삭제 실패:', doc.id, err);
                                }));
                            });
                            await Promise.allSettled(deletePromises);
                            console.log('✅ Firebase 거래 데이터 삭제 시도 완료');
                            
                            // 커스텀 드롭다운 데이터 삭제
                            const customBrandsDoc = db.collection('customDropdowns').doc(`brands_${userId}`);
                            const customSitesDoc = db.collection('customDropdowns').doc(`sites_${userId}`);
                            await Promise.allSettled([
                                customBrandsDoc.delete().catch(err => console.warn('⚠️ 브랜드 삭제 실패:', err)),
                                customSitesDoc.delete().catch(err => console.warn('⚠️ 사이트 삭제 실패:', err))
                            ]);
                            console.log('✅ Firebase 커스텀 데이터 삭제 시도 완료');
                        } catch (error) {
                            console.warn('⚠️ Firebase 데이터 삭제 중 오류 (계속 진행):', error);
                            // Firebase 삭제 실패해도 계속 진행
                        }
                    }
                    
                    // 5. 계정 삭제
                    await user.delete();
                    
                    console.log('✅ 회원탈퇴 성공');
                    alert('회원탈퇴가 완료되었습니다.');
                    
                    // 6. 계정정보 모달 닫기
                    document.getElementById('accountInfoModal').style.display = 'none';
                    
                } catch (error) {
                    console.error('❌ 회원탈퇴 오류:', error);
                    if (error.code === 'auth/requires-recent-login') {
                        alert('보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요.');
                    } else if (error.code === 'permission-denied') {
                        alert('Firebase 보안 규칙 설정이 필요합니다.\n\nFirebase Console에서 Firestore 보안 규칙을 설정한 후 다시 시도해주세요.\n자세한 내용은 README.MD 파일을 참조하세요.');
                    } else {
                        alert('회원탈퇴 중 오류가 발생했습니다.\n오류: ' + error.message);
                    }
                }
            }
        }
    });
}

// 인증 에러 메시지 변환
function getAuthErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
        'auth/invalid-email': '유효하지 않은 이메일 주소입니다.',
        'auth/operation-not-allowed': '이메일/비밀번호 계정이 비활성화되어 있습니다.',
        'auth/weak-password': '비밀번호가 너무 약합니다. 6자 이상 입력하세요.',
        'auth/user-disabled': '해당 계정이 비활성화되었습니다.',
        'auth/user-not-found': '존재하지 않는 계정입니다.',
        'auth/wrong-password': '잘못된 비밀번호입니다.',
        'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/too-many-requests': '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
        'auth/network-request-failed': '네트워크 연결을 확인해주세요.'
    };
    
    return errorMessages[errorCode] || '오류가 발생했습니다. 다시 시도해주세요.';
}

// 다른 사용자의 로컬스토리지 데이터 정리
function cleanupOtherUsersData(currentUserId) {
    try {
        console.log('🧹 로컬스토리지 정리 시작, 현재 사용자 UID:', currentUserId);
        
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
                key.startsWith('overseasTransactions_') ||
                key.startsWith('customBrands_') ||
                key.startsWith('customSites_')
            )) {
                // 현재 사용자의 키가 아닌 경우 삭제 목록에 추가
                if (!key.includes(currentUserId)) {
                    keysToRemove.push(key);
                }
            }
        }
        
        if (keysToRemove.length > 0) {
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log('🗑️ 다른 사용자 데이터 삭제:', key);
            });
            console.log(`✅ ${keysToRemove.length}개의 이전 사용자 데이터 정리 완료`);
        } else {
            console.log('✅ 정리할 데이터 없음');
        }
    } catch (error) {
        console.error('⚠️ 로컬스토리지 정리 오류:', error);
    }
}

// 앱 초기화 (로그인 후)
async function initializeApp() {
    initializeAppCallCount++;
    console.log(`🚀 initializeApp 호출됨 #${initializeAppCallCount}, isAppInitialized:`, isAppInitialized);
    
    // 이미 초기화되었다면 종료
    if (isAppInitialized) {
        console.warn(`⚠️ 앱 이미 초기화됨! 중복 호출 #${initializeAppCallCount} 차단`);
        return;
    }
    
    console.log('✅ 앱 초기화 시작');
    
    // 사용자 정보 표시
    const user = auth.currentUser;
    if (user) {
        document.getElementById('userBusinessName').textContent = user.displayName || '상호명 미설정';
        document.getElementById('userEmail').textContent = user.email;
        
        // 다른 사용자의 로컬스토리지 데이터 정리
        cleanupOtherUsersData(user.uid);
    }
    
    initializeTabs();
    initializeModal();
    initializeForm();
    initializeFilters();
    initializeButtons();
    initializeMarginCalculator();
    await loadCustomDropdownItems(); // 커스텀 드롭다운 항목 로드 (Firebase)
    
    // 환율 정보 자동 로드
    await fetchExchangeRates();
    
    // Firebase 또는 로컬스토리지에서 데이터 로드 (완료될 때까지 대기)
    await loadTransactions();
    
    // 거래내역 필터 초기화 (브라우저 캐시 방지)
    document.getElementById('filterBuyerName').value = '';
    document.getElementById('filterBrand').value = '';
    document.getElementById('filterProduct').value = '';
    document.getElementById('filterPurchaseSite').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterCurrency').value = '';
    document.getElementById('filterYear').value = '';
    
    // 데이터 로드 후 화면 업데이트
    updateStatistics();
    displayTransactions();
    updateSyncStatus(true);
    
    // 초기화 완료 플래그 설정
    isAppInitialized = true;
    console.log('✅ 앱 초기화 완료');
}

// ========================================
// Firebase 관련 함수
// ========================================

// 동기화 상태 업데이트
function updateSyncStatus(isOnline) {
    const statusElement = document.getElementById('syncStatus');
    if (statusElement) {
        if (isOnline) {
            statusElement.textContent = '🟢 온라인 (Firebase)';
            statusElement.className = 'status-online';
        } else {
            statusElement.textContent = '⚫ 오프라인 (로컬)';
            statusElement.className = 'status-offline';
        }
    }
}

// Firebase에서 거래 내역 불러오기
async function loadFromFirebase() {
    if (!isFirebaseEnabled || !currentUser) return;
    
    try {
        console.log('📥 Firebase에서 데이터 로드 시작, 사용자:', currentUser.email);
        console.log('🔑 암호화 키 존재 여부:', !!encryptionKey);
        
        const snapshot = await db.collection('transactions')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
            
        console.log(`📊 Firebase에서 ${snapshot.size}개 문서 조회됨`);
        
        transactions = [];
        let successCount = 0;
        let failCount = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 암호화된 데이터 복호화
            if (data.encryptedData && encryptionKey) {
                const decrypted = decryptData(data.encryptedData);
                if (decrypted) {
                    transactions.push({
                        ...decrypted,
                        id: doc.id
                    });
                    successCount++;
                } else {
                    console.error('❌ 거래 데이터 복호화 실패:', doc.id);
                    failCount++;
                }
            } else if (data.encryptedData && !encryptionKey) {
                console.error('❌ 암호화 키 없음, 문서 ID:', doc.id);
                failCount++;
            } else if (!data.encryptedData) {
                // 이전 버전 데이터 (암호화되지 않음)
                transactions.push({
                    ...data,
                    id: doc.id
                });
                successCount++;
            }
        });
        
        console.log(`✅ Firebase 로드 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
        
        if (failCount > 0) {
            console.warn('⚠️ 일부 데이터 복호화 실패!');
            console.log('💡 해결 방법:');
            console.log('   1. 로컬과 배포에서 같은 비밀번호를 사용했는지 확인');
            console.log('   2. 브라우저 콘솔에서 "🔑 암호화 키 생성, salt:" 로그 확인');
            console.log('   3. 로컬과 배포에서 salt(이메일)가 같은지 확인');
        }
        
    } catch (error) {
        console.error('❌ Firebase 불러오기 오류:', error);
        // Firebase 실패 시 로컬스토리지에서 불러오기 시도
        console.log('⚠️ 로컬스토리지에서 데이터 불러오기 시도');
        const saved = localStorage.getItem(`overseasTransactions_${currentUser.uid}`);
        if (saved) {
            const encryptedData = JSON.parse(saved);
            if (encryptedData && encryptionKey) {
                const decrypted = decryptData(encryptedData);
                if (decrypted) {
                    transactions = decrypted;
                }
            }
        }
    }
}

// Firebase에 거래 저장
async function saveToFirebase(transaction) {
    if (!isFirebaseEnabled || !currentUser) return null;
    
    try {
        // id 필드를 제외한 데이터 복사 (Firebase가 자동으로 문서 ID 생성)
        const { id, ...dataToSave } = transaction;
        
        // 데이터 암호화
        const encryptedData = encryptData(dataToSave);
        
        const docRef = await db.collection('transactions').add({
            userId: currentUser.uid,
            encryptedData: encryptedData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firebase 저장 성공 (암호화됨):', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('❌ Firebase 저장 오류:', error);
        throw error;
    }
}

// Firebase 거래 업데이트
async function updateToFirebase(id, transaction) {
    if (!isFirebaseEnabled) return;
    
    try {
        // id 필드를 제외한 데이터 복사
        const { id: _, ...dataToUpdate } = transaction;
        
        // 데이터 암호화
        const encryptedData = encryptData(dataToUpdate);
        
        await db.collection('transactions').doc(id).update({
            encryptedData: encryptedData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firebase 업데이트 성공 (암호화됨):', id);
    } catch (error) {
        console.error('❌ Firebase 업데이트 오류:', error);
        throw error;
    }
}

// Firebase에서 거래 삭제
async function deleteFromFirebase(id) {
    if (!isFirebaseEnabled) return;
    
    try {
        await db.collection('transactions').doc(id).delete();
        console.log('✅ Firebase 삭제 성공:', id);
    } catch (error) {
        console.error('❌ Firebase 삭제 오류:', error);
        throw error;
    }
}

// Firebase 전체 삭제
async function clearFirebase() {
    if (!isFirebaseEnabled) return;
    
    try {
        const snapshot = await db.collection('transactions').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log('✅ Firebase 전체 삭제 성공');
    } catch (error) {
        console.error('❌ Firebase 전체 삭제 오류:', error);
        throw error;
    }
}

// ========================================
// 탭 및 모달 제어
// ========================================

// 탭 초기화
function initializeTabs() {
    console.log('📑 initializeTabs 호출됨, isTabsInitialized:', isTabsInitialized);
    
    // 이미 초기화되었다면 종료
    if (isTabsInitialized) {
        console.log('⏭️ 탭 이미 초기화됨, 건너뜀');
        return;
    }
    
    console.log('✅ 탭 이벤트 리스너 등록 시작');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // 모든 탭 버튼 비활성화
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // 모든 탭 콘텐츠 숨기기
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 선택한 탭 활성화
            this.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
        });
    });
    
    // 초기화 완료 플래그 설정
    isTabsInitialized = true;
    console.log('✅ 탭 초기화 완료');
}

// 모달 초기화
function initializeModal() {
    console.log('🪟 initializeModal 호출됨, isModalInitialized:', isModalInitialized);
    
    // 이미 초기화되었다면 종료
    if (isModalInitialized) {
        console.log('⏭️ 모달 이미 초기화됨, 건너뜀');
        return;
    }
    
    console.log('✅ 모달 이벤트 리스너 등록 시작');
    
    const modal = document.getElementById('transactionModal');
    const openBtn = document.getElementById('addTransactionBtn');
    const closeBtn = document.querySelector('.modal-close');
    
    // 모달 열기 (항상 새 등록 모드)
    openBtn.addEventListener('click', async function() {
        // 폼 초기화
        const form = document.getElementById('transactionForm');
        form.reset();
        form.removeAttribute('data-editing-id');
        
        // 브랜드 커스텀 입력 숨기기
        document.getElementById('brandCustom').style.display = 'none';
        document.getElementById('brandCustom').value = '';
        
        // 구매사이트 커스텀 입력 숨기기
        document.getElementById('purchaseSiteCustom').style.display = 'none';
        document.getElementById('purchaseSiteCustom').value = '';
        
        // 오늘 날짜로 설정
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('purchaseDate').value = today;
        document.getElementById('quantity').value = 1;
        document.getElementById('platformFee').value = 10.0;
        
        // 새 필드 초기화
        document.getElementById('purchaseUrl').value = '';
        document.getElementById('shippingMethod').value = 'direct';
        
        // 계산 결과 초기화
        document.getElementById('calcTotalCost').textContent = '0원';
        document.getElementById('calcProfit').textContent = '0원';
        document.getElementById('calcMargin').textContent = '0%';
        
        // 모달 헤더 설정
        document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';
        
        // 최신 환율 자동 가져오기 및 USD 환율 자동 입력
        await fetchExchangeRates();
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // 모달 닫기
    closeBtn.addEventListener('click', closeModal);
    
    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
    
    // 계정 정보 모달 배경 클릭 시 닫기
    const accountModal = document.getElementById('accountInfoModal');
    if (accountModal) {
        accountModal.addEventListener('click', function(e) {
            if (e.target === accountModal) {
                accountModal.style.display = 'none';
            }
        });
        
        // ESC 키로 계정 정보 모달 닫기
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && accountModal.style.display === 'flex') {
                accountModal.style.display = 'none';
            }
        });
    }
    
    // 초기화 완료 플래그 설정
    isModalInitialized = true;
    console.log('✅ 모달 초기화 완료');
}

function closeModal() {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    
    // 수정 모드 해제
    form.removeAttribute('data-editing-id');
    
    // 모달 헤더 원상복구
    document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// 로컬스토리지에서 거래 내역 불러오기
async function loadTransactions() {
    if (isFirebaseEnabled) {
        // Firebase 사용 시
        await loadFromFirebase();
        // Firebase에서 불러온 후 로컬스토리지에도 백업
        if (transactions.length > 0) {
            saveTransactions();
        }
    } else {
        // 로컬스토리지 사용 시
        const saved = localStorage.getItem('overseasTransactions');
        if (saved) {
            try {
                transactions = JSON.parse(saved);
                console.log(`✅ 로컬스토리지에서 ${transactions.length}개 거래 불러옴`);
            } catch (error) {
                console.error('❌ 로컬스토리지 파싱 오류:', error);
                transactions = [];
            }
        }
    }
}

// 로컬스토리지에 거래 내역 저장
function saveTransactions() {
    if (!currentUser) return;
    
    try {
        if (encryptionKey) {
            // 데이터 암호화 후 저장
            const encryptedData = encryptData(transactions);
            localStorage.setItem(`overseasTransactions_${currentUser.uid}`, JSON.stringify(encryptedData));
            console.log('💾 로컬스토리지 백업 완료 (암호화됨)');
        } else {
            // 암호화 키가 없으면 평문으로 저장 (하위 호환성)
            localStorage.setItem(`overseasTransactions_${currentUser.uid}`, JSON.stringify(transactions));
            console.log('💾 로컬스토리지 백업 완료 (평문)');
        }
    } catch (error) {
        console.error('❌ 로컬스토리지 저장 오류:', error);
    }
}

// 폼 초기화
function initializeForm() {
    const form = document.getElementById('transactionForm');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;

    console.log('🔧 initializeForm 호출됨, isFormInitialized:', isFormInitialized);
    
    // 이벤트 리스너가 이미 등록되었다면 종료
    if (isFormInitialized) {
        console.log('⏭️ 폼 이미 초기화됨, 건너뜀');
        return;
    }

    console.log('✅ 폼 이벤트 리스너 등록 시작');

    // 구매사이트 선택 시 커스텀 입력 표시/숨김
    const purchaseSiteSelect = document.getElementById('purchaseSite');
    const purchaseSiteCustom = document.getElementById('purchaseSiteCustom');

    purchaseSiteSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            purchaseSiteCustom.style.display = 'block';
            purchaseSiteCustom.required = true;
        } else {
            purchaseSiteCustom.style.display = 'none';
            purchaseSiteCustom.required = false;
            purchaseSiteCustom.value = '';
        }
    });

    // 플랫폼 선택 시 수수료율 자동 설정
    const platformSelect = document.getElementById('platform');
    const platformFeeInput = document.getElementById('platformFee');

    platformSelect.addEventListener('change', function() {
        const fees = {
            'coupang': 10.0,
            'naver': 5.6,
            'street11': 11.0,
            'gmarket': 12.0,
            'auction': 12.0,
            'direct': 0,
            'custom': 0
        };
        
        // 모든 플랫폼에서 수수료를 자동으로 설정하되 수정 가능
        platformFeeInput.value = fees[this.value] || 0;
        platformFeeInput.readOnly = false; // 항상 수정 가능
        
        calculateRealtime();
    });

    // 실시간 계산을 위한 이벤트 리스너
    const calcInputs = ['purchasePrice', 'internationalShipping', 'currency', 'shippingCurrency', 
                       'exchangeRate', 'shippingExchangeRate', 'salePrice', 
                       'platformFee', 'customsDuty', 'shippingFee', 'quantity'];
    
    calcInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateRealtime);
        }
    });

    // 통화 변경 시 자동 환율 입력
    const currencySelect = document.getElementById('currency');
    if (currencySelect) {
        currencySelect.addEventListener('change', updateExchangeRateInput);
    }
    
    const shippingCurrencySelect = document.getElementById('shippingCurrency');
    if (shippingCurrencySelect) {
        shippingCurrencySelect.addEventListener('change', updateShippingExchangeRateInput);
    }

    // 환율 업데이트 버튼
    const updateExchangeRateBtn = document.getElementById('updateExchangeRateBtn');
    if (updateExchangeRateBtn) {
        updateExchangeRateBtn.addEventListener('click', fetchExchangeRates);
    }
    
    const updateShippingExchangeRateBtn = document.getElementById('updateShippingExchangeRateBtn');
    if (updateShippingExchangeRateBtn) {
        updateShippingExchangeRateBtn.addEventListener('click', fetchShippingExchangeRates);
    }

    // 폼 제출
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('📋 폼 제출 이벤트 트리거됨');
        await addTransaction();
    });
    
    // 초기화 완료 플래그 설정
    isFormInitialized = true;
    console.log('✅ 폼 초기화 완료, isFormInitialized =', isFormInitialized);
    console.log(`📊 상태 요약: initializeAppCallCount=${initializeAppCallCount}, formSubmitCallCount=${formSubmitCallCount}`);
}

// 실시간 계산
function calculateRealtime() {
    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value) || 0;
    const internationalShipping = parseFloat(document.getElementById('internationalShipping').value) || 0;
    const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 0;
    const shippingExchangeRate = parseFloat(document.getElementById('shippingExchangeRate').value) || 0;
    const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
    const platformFee = parseFloat(document.getElementById('platformFee').value) || 0;
    const customsDuty = parseFloat(document.getElementById('customsDuty').value) || 0;
    const shippingFee = parseFloat(document.getElementById('shippingFee').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value) || 1;

    // 구매가격 (원화 환산)
    const purchasePriceKRW = purchasePrice * exchangeRate * quantity;
    
    // 해외배송비 (원화 환산)
    const shippingKRW = internationalShipping * shippingExchangeRate * quantity;
    
    // 플랫폼 수수료
    const platformFeeAmount = salePrice * (platformFee / 100);
    
    // 총 비용 (구매가격 + 해외배송비 + 플랫폼수수료 + 관부과세 + 국내배송비)
    const totalCost = purchasePriceKRW + shippingKRW + platformFeeAmount + customsDuty + shippingFee;
    
    // 순이익
    const profit = salePrice - totalCost;
    
    // 마진율
    const margin = salePrice > 0 ? (profit / salePrice * 100) : 0;

    // 결과 표시
    document.getElementById('calcTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('calcProfit').textContent = formatCurrency(profit);
    document.getElementById('calcProfit').style.color = profit >= 0 ? '#667eea' : '#dc3545';
    document.getElementById('calcMargin').textContent = margin.toFixed(2) + '%';
}

// 거래 추가/수정
async function addTransaction() {
    formSubmitCallCount++;
    console.log(`📝 addTransaction 호출됨 #${formSubmitCallCount}, isSubmitting:`, isSubmitting);
    
    // 이미 제출 중이면 중복 실행 방지
    if (isSubmitting) {
        console.warn(`⚠️ 이미 제출 중! 중복 호출 #${formSubmitCallCount} 차단`);
        return;
    }
    
    // 제출 중 플래그 설정
    isSubmitting = true;
    console.log('🔒 제출 시작, isSubmitting = true');
    
    try {
        const form = document.getElementById('transactionForm');
        const editingId = form.getAttribute('data-editing-id');
        const isEditing = !!editingId;

        // 브랜드 값 가져오기 (custom 선택 시 brandCustom 값 사용)
        const brandSelect = document.getElementById('brand');
        const brandValue = brandSelect.value === 'custom' ? 
            document.getElementById('brandCustom').value : 
            brandSelect.value;

    const transaction = {
        buyerName: document.getElementById('buyerName').value,
        buyerPhone: document.getElementById('buyerPhone').value,
        buyerAddress: document.getElementById('buyerAddress').value,
        brand: brandValue,
        productName: document.getElementById('productName').value,
        quantity: parseInt(document.getElementById('quantity').value),
        purchaseDate: document.getElementById('purchaseDate').value,
        purchaseSite: document.getElementById('purchaseSite').value,
        purchaseSiteCustom: document.getElementById('purchaseSiteCustom').value,
        purchaseUrl: document.getElementById('purchaseUrl').value || '',
        shippingMethod: document.getElementById('shippingMethod').value,
        purchasePrice: parseFloat(document.getElementById('purchasePrice').value),
        internationalShipping: parseFloat(document.getElementById('internationalShipping').value) || 0,
        currency: document.getElementById('currency').value,
        shippingCurrency: document.getElementById('shippingCurrency').value,
        exchangeRate: parseFloat(document.getElementById('exchangeRate').value),
        shippingExchangeRate: parseFloat(document.getElementById('shippingExchangeRate').value) || 0,
        salePrice: parseFloat(document.getElementById('salePrice').value),
        platform: document.getElementById('platform').value,
        platformFee: parseFloat(document.getElementById('platformFee').value),
        customsDuty: parseFloat(document.getElementById('customsDuty').value),
        shippingFee: parseFloat(document.getElementById('shippingFee').value)
    };

    // 계산된 값 추가
    transaction.purchasePriceKRW = transaction.purchasePrice * transaction.exchangeRate * transaction.quantity;
    transaction.shippingKRW = transaction.internationalShipping * transaction.shippingExchangeRate * transaction.quantity;
    transaction.platformFeeAmount = transaction.salePrice * (transaction.platformFee / 100);
    transaction.totalCost = transaction.purchasePriceKRW + transaction.shippingKRW + transaction.platformFeeAmount + transaction.customsDuty + transaction.shippingFee;
    transaction.profit = transaction.salePrice - transaction.totalCost;
    transaction.margin = transaction.salePrice > 0 ? (transaction.profit / transaction.salePrice * 100) : 0;

    if (isEditing) {
        // 수정 모드
        transaction.id = editingId;
        
        // 로컬 배열에서 기존 거래 찾아서 업데이트
        const index = transactions.findIndex(t => t.id === editingId);
        if (index !== -1) {
            transactions[index] = transaction;
        }

        // Firebase 업데이트 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                await updateToFirebase(editingId, transaction);
                console.log('✅ Firebase 업데이트 완료:', editingId);
            } catch (error) {
                console.error('❌ Firebase 업데이트 실패:', error);
            }
        }

        saveTransactions();
        alert('거래가 성공적으로 수정되었습니다!');
    } else {
        // 추가 모드
        // Firebase에 저장 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                const firebaseId = await saveToFirebase(transaction);
                if (firebaseId) {
                    transaction.id = firebaseId;
                    console.log('✅ Firebase 저장 완료:', firebaseId);
                }
            } catch (error) {
                console.error('❌ Firebase 저장 실패:', error);
                // Firebase 실패 시 로컬 ID 사용
                transaction.id = Date.now().toString();
            }
        } else {
            // 로컬 전용 모드
            transaction.id = Date.now().toString();
        }

        transactions.unshift(transaction); // 최신 거래를 앞에 추가
        
        // 중복 체크 (같은 ID가 2개 이상 있는지 확인)
        const duplicateCount = transactions.filter(t => t.id === transaction.id).length;
        if (duplicateCount > 1) {
            console.error('❌ 중복 거래 감지! ID:', transaction.id, '개수:', duplicateCount);
            // 중복 제거 (가장 최근 것만 남김)
            const firstIndex = transactions.findIndex(t => t.id === transaction.id);
            transactions = transactions.filter((t, index) => 
                t.id !== transaction.id || index === firstIndex
            );
            console.log('✅ 중복 제거 완료, 남은 거래 수:', transactions.length);
        }
        
        saveTransactions(); // 로컬스토리지에도 백업
        alert('거래가 성공적으로 등록되었습니다!');
    }
    
    // 폼 초기화
    form.reset();
    form.removeAttribute('data-editing-id');
    
    // 브랜드 커스텀 입력 숨기기
    document.getElementById('brandCustom').style.display = 'none';
    
    // 구매사이트 커스텀 입력 숨기기
    document.getElementById('purchaseSiteCustom').style.display = 'none';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today;
    document.getElementById('quantity').value = 1;
    document.getElementById('platformFee').value = 10.0;
    
    // 계산 결과 초기화
    document.getElementById('calcTotalCost').textContent = '0원';
    document.getElementById('calcProfit').textContent = '0원';
    document.getElementById('calcMargin').textContent = '0%';

    // 모달 헤더 원상복구
    document.querySelector('.modal-header h2').textContent = '➕ 새 거래 등록';

    // 모달 닫기
    closeModal();

    // 화면 업데이트
    updateStatistics();
    displayTransactions();
    
    } finally {
        // 제출 중 플래그 해제
        isSubmitting = false;
        console.log('🔓 제출 완료, isSubmitting = false');
    }
}

// 거래 삭제
async function deleteTransaction(id) {
    if (confirm('이 거래를 삭제하시겠습니까?')) {
        // Firebase에서 삭제 (활성화된 경우)
        if (isFirebaseEnabled) {
            try {
                await deleteFromFirebase(id);
            } catch (error) {
                console.error('❌ Firebase 삭제 실패, 로컬만 삭제:', error);
            }
        }
        
        // 로컬 데이터 삭제
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateStatistics();
        displayTransactions();
    }
}

// 거래 수정
function editTransaction(id) {
    // 수정할 거래 찾기
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) {
        alert('거래를 찾을 수 없습니다.');
        return;
    }

    // 폼에 기존 데이터 채우기
    document.getElementById('buyerName').value = transaction.buyerName;
    document.getElementById('buyerPhone').value = transaction.buyerPhone;
    document.getElementById('buyerAddress').value = transaction.buyerAddress || '';
    
    // 브랜드 처리
    const brandSelect = document.getElementById('brand');
    const brandCustomInput = document.getElementById('brandCustom');
    const brandOptions = Array.from(brandSelect.options).map(opt => opt.value);
    
    if (brandOptions.includes(transaction.brand)) {
        // 드롭다운에 있는 브랜드
        brandSelect.value = transaction.brand;
        brandCustomInput.style.display = 'none';
    } else {
        // 드롭다운에 없는 브랜드 (직접 입력)
        brandSelect.value = 'custom';
        brandCustomInput.style.display = 'block';
        brandCustomInput.value = transaction.brand;
    }
    
    document.getElementById('productName').value = transaction.productName;
    document.getElementById('quantity').value = transaction.quantity;
    document.getElementById('purchaseDate').value = transaction.purchaseDate;
    
    // 구매사이트 처리
    const siteSelect = document.getElementById('purchaseSite');
    const siteCustomInput = document.getElementById('purchaseSiteCustom');
    const siteOptions = Array.from(siteSelect.options).map(opt => opt.value);
    
    if (siteOptions.includes(transaction.purchaseSite)) {
        // 드롭다운에 있는 사이트
        siteSelect.value = transaction.purchaseSite;
        siteCustomInput.style.display = 'none';
    } else {
        // 드롭다운에 없는 사이트 (기타 - 직접 입력)
        siteSelect.value = 'other';
        siteCustomInput.style.display = 'block';
        siteCustomInput.value = transaction.purchaseSiteCustom || transaction.purchaseSite;
    }
    
    document.getElementById('purchaseUrl').value = transaction.purchaseUrl || '';
    document.getElementById('shippingMethod').value = transaction.shippingMethod || 'direct';
    document.getElementById('purchasePrice').value = transaction.purchasePrice;
    document.getElementById('internationalShipping').value = transaction.internationalShipping || 0;
    document.getElementById('currency').value = transaction.currency;
    document.getElementById('shippingCurrency').value = transaction.shippingCurrency || transaction.currency;
    document.getElementById('exchangeRate').value = transaction.exchangeRate;
    document.getElementById('shippingExchangeRate').value = transaction.shippingExchangeRate || transaction.exchangeRate;
    document.getElementById('salePrice').value = transaction.salePrice;
    document.getElementById('platform').value = transaction.platform;
    document.getElementById('platformFee').value = transaction.platformFee;
    document.getElementById('customsDuty').value = transaction.customsDuty;
    document.getElementById('shippingFee').value = transaction.shippingFee;

    // 실시간 계산 업데이트
    calculateRealtime();

    // 모달 열기
    const modal = document.getElementById('transactionModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 폼의 data 속성에 수정 중인 ID 저장
    document.getElementById('transactionForm').setAttribute('data-editing-id', id);
    
    // 모달 헤더 변경
    document.querySelector('.modal-header h2').textContent = '✏️ 거래 수정';
}

// 거래 내역 표시
function displayTransactions() {
    const listContainer = document.getElementById('transactionsList');
    const filteredTransactions = getFilteredTransactions();
    
    // 연도 필터 드롭다운 업데이트
    populateYearFilter();

    // 필터 결과 카운트 업데이트
    const filterCountElement = document.getElementById('filterResultCount');
    if (filterCountElement) {
        filterCountElement.textContent = `전체 ${filteredTransactions.length}건`;
    }

    if (filteredTransactions.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">표시할 거래 내역이 없습니다.</p>';
        return;
    }

    listContainer.innerHTML = filteredTransactions.map(t => `
        <div class="transaction-card">
            <div class="transaction-header">
                <div class="transaction-title">
                    <h3>${t.brand} - ${t.productName}</h3>
                    <p class="buyer-info">👤 ${t.buyerName} | 📞 ${t.buyerPhone}</p>
                    ${t.buyerAddress ? `<p class="buyer-address">📍 ${t.buyerAddress}</p>` : ''}
                </div>
                <div class="transaction-date">${formatDate(t.purchaseDate)}</div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-item">
                    <span class="detail-label">수량</span>
                    <span class="detail-value">${t.quantity}개</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">구매사이트</span>
                    <span class="detail-value">${getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom)}</span>
                </div>
                ${t.purchaseUrl ? `
                <div class="detail-item">
                    <span class="detail-label">상품 URL</span>
                    <span class="detail-value"><a href="${t.purchaseUrl}" target="_blank" style="color: #4a90e2; text-decoration: underline;">링크 바로가기 🔗</a></span>
                </div>
                ` : ''}
                <div class="detail-item">
                    <span class="detail-label">배송 방식</span>
                    <span class="detail-value">${t.shippingMethod === 'direct' ? '직배송' : '배대지'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">구매가격</span>
                    <span class="detail-value">${t.purchasePrice.toFixed(2)} ${t.currency} (환율: ${formatCurrency(t.exchangeRate)})</span>
                </div>
                ${t.internationalShipping > 0 ? `
                <div class="detail-item">
                    <span class="detail-label">해외배송비</span>
                    <span class="detail-value">${t.internationalShipping.toFixed(2)} ${t.shippingCurrency || t.currency}${t.shippingExchangeRate ? ` (환율: ${formatCurrency(t.shippingExchangeRate)})` : ''}</span>
                </div>
                ` : ''}
                <div class="detail-item">
                    <span class="detail-label">판매가격</span>
                    <span class="detail-value">${formatCurrency(t.salePrice)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">판매 플랫폼</span>
                    <span class="detail-value">${getPlatformName(t.platform)} (${t.platformFee}%)</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">관부과세</span>
                    <span class="detail-value">${formatCurrency(t.customsDuty)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">국내배송비</span>
                    <span class="detail-value">${formatCurrency(t.shippingFee)}</span>
                </div>
            </div>
            
            <div class="transaction-summary">
                <div class="summary-item">
                    <span class="summary-label">총 비용</span>
                    <span class="summary-value">${formatCurrency(t.totalCost)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">순이익</span>
                    <span class="summary-value ${t.profit >= 0 ? 'profit' : 'loss'}">
                        ${formatCurrency(t.profit)}
                    </span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">마진률</span>
                    <span class="summary-value">${t.margin.toFixed(2)}%</span>
                </div>
                <div class="summary-item">
                    <button class="btn-edit" onclick="editTransaction('${t.id}')">수정</button>
                    <button class="btn-delete" onclick="deleteTransaction('${t.id}')">삭제</button>
                </div>
            </div>
        </div>
    `).join('');
}

// 통계 업데이트
function updateStatistics() {
    const filteredTransactions = getStatisticsFilteredTransactions();
    
    if (filteredTransactions.length === 0) {
        document.getElementById('totalRevenue').textContent = '0원';
        document.getElementById('totalCost').textContent = '0원';
        document.getElementById('totalProfit').textContent = '0원';
        document.getElementById('avgMargin').textContent = '0%';
        updateCharts([]); // 빈 데이터로 차트 업데이트
        return;
    }

    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.salePrice, 0);
    const totalCost = filteredTransactions.reduce((sum, t) => sum + t.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = filteredTransactions.reduce((sum, t) => sum + t.margin, 0) / filteredTransactions.length;

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('totalCost').textContent = formatCurrency(totalCost);
    document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);
    document.getElementById('totalProfit').style.color = totalProfit >= 0 ? '#ffd700' : '#ff6b6b';
    document.getElementById('avgMargin').textContent = avgMargin.toFixed(2) + '%';

    // 그래프 업데이트
    updateCharts(filteredTransactions);
}

// 필터 초기화
function initializeFilters() {
    const periodFilter = document.getElementById('statisticsPeriodFilter');
    const customDateRange = document.getElementById('customDateRange');
    const applyCustomDate = document.getElementById('applyCustomDate');

    periodFilter.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            updateStatistics();
        }
    });

    applyCustomDate.addEventListener('click', function() {
        updateStatistics();
    });
}

// ========================================
// 환율 API 관리
// ========================================

// 환율 정보 가져오기
async function fetchExchangeRates() {
    try {
        const updateBtn = document.getElementById('updateExchangeRateBtn');
        const updateText = document.getElementById('exchangeRateUpdate');
        
        if (updateBtn) updateBtn.disabled = true;
        if (updateText) updateText.textContent = '업데이트 중...';
        
        // ExchangeRate-API 사용 (무료, API 키 불필요)
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/KRW');
        
        if (!response.ok) {
            throw new Error('환율 정보를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        
        // 환율 데이터 저장 (KRW 기준이므로 역수 계산)
        exchangeRates = {
            KRW: 1.0, // 원화는 환율 1.0
            USD: data.rates.USD ? (1 / data.rates.USD).toFixed(2) : 0,
            EUR: data.rates.EUR ? (1 / data.rates.EUR).toFixed(2) : 0,
            GBP: data.rates.GBP ? (1 / data.rates.GBP).toFixed(2) : 0,
            JPY: data.rates.JPY ? (1 / data.rates.JPY).toFixed(2) : 0,
            CNY: data.rates.CNY ? (1 / data.rates.CNY).toFixed(2) : 0
        };
        
        // 마지막 업데이트 시간 저장
        lastExchangeRateUpdate = new Date();
        
        // 업데이트 시간 표시
        if (updateText) {
            const timeStr = lastExchangeRateUpdate.toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            updateText.textContent = `최종 업데이트: ${timeStr}`;
        }
        
        // 현재 선택된 통화의 환율 자동 입력
        updateExchangeRateInput();
        
        console.log('✅ 환율 정보 업데이트 완료:', exchangeRates);
        
    } catch (error) {
        console.error('❌ 환율 정보 가져오기 실패:', error);
        
        // 실패 시 기본값 설정
        if (!exchangeRates.KRW) {
            exchangeRates.KRW = 1.0;
        }
        if (!exchangeRates.USD) {
            exchangeRates.USD = 1300.0; // USD 기본값
        }
        
        // USD 환율 자동 입력
        const currencySelect = document.getElementById('currency');
        const exchangeRateInput = document.getElementById('exchangeRate');
        if (currencySelect && exchangeRateInput && currencySelect.value === 'USD') {
            exchangeRateInput.value = exchangeRates.USD;
        }
        
        const updateText = document.getElementById('exchangeRateUpdate');
        if (updateText) {
            updateText.textContent = '업데이트 실패 (수동 입력 가능)';
        }
    } finally {
        const updateBtn = document.getElementById('updateExchangeRateBtn');
        if (updateBtn) updateBtn.disabled = false;
    }
}

// 선택된 통화에 맞는 환율 자동 입력
function updateExchangeRateInput() {
    const currencySelect = document.getElementById('currency');
    const exchangeRateInput = document.getElementById('exchangeRate');
    const exchangeRateHint = document.getElementById('exchangeRateHint');
    
    if (!currencySelect || !exchangeRateInput) return;
    
    const selectedCurrency = currencySelect.value;
    
    // KRW 선택 시 환율 1.0 고정
    if (selectedCurrency === 'KRW') {
        exchangeRateInput.value = 1.0;
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '원화는 환율 1.0 고정 | <span id="exchangeRateUpdate">-</span>';
        }
        calculateRealtime();
        return;
    }
    
    // 다른 통화 선택 시 자동 환율 입력
    if (selectedCurrency && exchangeRates[selectedCurrency]) {
        exchangeRateInput.value = exchangeRates[selectedCurrency];
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '1 외화당 원화 환율 | <span id="exchangeRateUpdate">' + 
                (document.getElementById('exchangeRateUpdate') ? document.getElementById('exchangeRateUpdate').textContent : '-') + 
                '</span>';
        }
        
        // 실시간 계산 트리거
        calculateRealtime();
    }
}

// 배송비 환율 자동 입력
function updateShippingExchangeRateInput() {
    const currencySelect = document.getElementById('shippingCurrency');
    const exchangeRateInput = document.getElementById('shippingExchangeRate');
    const exchangeRateHint = document.getElementById('shippingExchangeRateHint');
    
    if (!currencySelect || !exchangeRateInput) return;
    
    const selectedCurrency = currencySelect.value;
    
    // KRW 선택 시 환율 1.0 고정
    if (selectedCurrency === 'KRW') {
        exchangeRateInput.value = 1.0;
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '원화는 환율 1.0 고정 | <span id="shippingExchangeRateUpdate">-</span>';
        }
        calculateRealtime();
        return;
    }
    
    // 다른 통화 선택 시 자동 환율 입력
    if (selectedCurrency && exchangeRates[selectedCurrency]) {
        exchangeRateInput.value = exchangeRates[selectedCurrency];
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '1 외화당 원화 환율 | <span id="shippingExchangeRateUpdate">' + 
                (document.getElementById('shippingExchangeRateUpdate') ? document.getElementById('shippingExchangeRateUpdate').textContent : '-') + 
                '</span>';
        }
        
        // 실시간 계산 트리거
        calculateRealtime();
    }
}

// 배송비 환율 가져오기
async function fetchShippingExchangeRates() {
    await fetchExchangeRates();
    updateShippingExchangeRateInput();
}

// ========================================
// 마진율 계산기
// ========================================

// 마진율 계산기 모달 열기
async function openMarginCalculator() {
    const modal = document.getElementById('marginCalculatorModal');
    
    // 폼 초기화
    document.getElementById('calcPurchasePrice').value = '';
    document.getElementById('calcInternationalShipping').value = '0';
    document.getElementById('calcCurrency').value = 'USD';
    document.getElementById('calcShippingCurrency').value = 'KRW';
    document.getElementById('calcExchangeRate').value = '';
    document.getElementById('calcShippingExchangeRate').value = '1.0';
    document.getElementById('calcSalePrice').value = '';
    document.getElementById('calcPlatform').value = 'coupang';
    document.getElementById('calcPlatformFee').value = '10.0';
    document.getElementById('calcCustomsDuty').value = '0';
    document.getElementById('calcShippingFee').value = '5000';
    
    // 계산 결과 초기화
    document.getElementById('calcResultTotalCost').textContent = '0원';
    document.getElementById('calcResultProfit').textContent = '0원';
    document.getElementById('calcResultProfit').className = 'profit';
    document.getElementById('calcResultMargin').textContent = '0%';
    
    // 최신 환율 자동 가져오기 및 USD 환율 자동 입력
    await fetchExchangeRatesForCalculator();
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 마진율 계산기용 환율 정보 가져오기
async function fetchExchangeRatesForCalculator() {
    try {
        const updateBtn = document.getElementById('calcUpdateExchangeRateBtn');
        const updateText = document.getElementById('calcExchangeRateUpdate');
        
        if (updateBtn) updateBtn.disabled = true;
        if (updateText) updateText.textContent = '업데이트 중...';
        
        // ExchangeRate-API 사용 (무료, API 키 불필요)
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/KRW');
        
        if (!response.ok) {
            throw new Error('환율 정보를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        
        // 환율 데이터 저장 (KRW 기준이므로 역수 계산)
        const calcExchangeRates = {
            KRW: 1.0,
            USD: data.rates.USD ? (1 / data.rates.USD).toFixed(2) : 0,
            EUR: data.rates.EUR ? (1 / data.rates.EUR).toFixed(2) : 0,
            GBP: data.rates.GBP ? (1 / data.rates.GBP).toFixed(2) : 0,
            JPY: data.rates.JPY ? (1 / data.rates.JPY).toFixed(2) : 0,
            CNY: data.rates.CNY ? (1 / data.rates.CNY).toFixed(2) : 0
        };
        
        // 마지막 업데이트 시간 표시
        if (updateText) {
            const now = new Date();
            const timeStr = now.toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            updateText.textContent = `최종 업데이트: ${timeStr}`;
        }
        
        // 현재 선택된 통화의 환율 자동 입력
        const currencySelect = document.getElementById('calcCurrency');
        const exchangeRateInput = document.getElementById('calcExchangeRate');
        const selectedCurrency = currencySelect.value;
        
        if (selectedCurrency && calcExchangeRates[selectedCurrency]) {
            exchangeRateInput.value = calcExchangeRates[selectedCurrency];
            calculateMargin();
        }
        
        console.log('✅ 계산기 환율 정보 업데이트 완료:', calcExchangeRates);
        
    } catch (error) {
        console.error('❌ 계산기 환율 정보 가져오기 실패:', error);
        
        // 실패 시 기본값 설정
        const currencySelect = document.getElementById('calcCurrency');
        const exchangeRateInput = document.getElementById('calcExchangeRate');
        if (currencySelect.value === 'USD' && !exchangeRateInput.value) {
            exchangeRateInput.value = 1300.0;
        }
        
        const updateText = document.getElementById('calcExchangeRateUpdate');
        if (updateText) {
            updateText.textContent = '업데이트 실패 (수동 입력 가능)';
        }
    } finally {
        const updateBtn = document.getElementById('calcUpdateExchangeRateBtn');
        if (updateBtn) updateBtn.disabled = false;
    }
}

// 마진율 계산기 닫기
function closeMarginCalculator() {
    const modal = document.getElementById('marginCalculatorModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// 계산기 구매가격 환율 자동 입력
function updateCalcExchangeRateInput() {
    const currencySelect = document.getElementById('calcCurrency');
    const exchangeRateInput = document.getElementById('calcExchangeRate');
    const exchangeRateHint = document.getElementById('calcExchangeRateHint');
    
    if (!currencySelect || !exchangeRateInput) return;
    
    const selectedCurrency = currencySelect.value;
    
    // KRW 선택 시 환율 1.0 고정
    if (selectedCurrency === 'KRW') {
        exchangeRateInput.value = 1.0;
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '원화는 환율 1.0 고정 | <span id="calcExchangeRateUpdate">-</span>';
        }
        calculateMargin();
        return;
    }
    
    // 다른 통화 선택 시 자동 환율 입력
    if (selectedCurrency && exchangeRates[selectedCurrency]) {
        exchangeRateInput.value = exchangeRates[selectedCurrency];
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '1 외화당 원화 환율 | <span id="calcExchangeRateUpdate">' + 
                (document.getElementById('calcExchangeRateUpdate') ? document.getElementById('calcExchangeRateUpdate').textContent : '-') + 
                '</span>';
        }
        calculateMargin();
    }
}

// 계산기 배송비 환율 자동 입력
function updateCalcShippingExchangeRateInput() {
    const currencySelect = document.getElementById('calcShippingCurrency');
    const exchangeRateInput = document.getElementById('calcShippingExchangeRate');
    const exchangeRateHint = document.getElementById('calcShippingExchangeRateHint');
    
    if (!currencySelect || !exchangeRateInput) return;
    
    const selectedCurrency = currencySelect.value;
    
    // KRW 선택 시 환율 1.0 고정
    if (selectedCurrency === 'KRW') {
        exchangeRateInput.value = 1.0;
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '원화는 환율 1.0 고정 | <span id="calcShippingExchangeRateUpdate">-</span>';
        }
        calculateMargin();
        return;
    }
    
    // 다른 통화 선택 시 자동 환율 입력
    if (selectedCurrency && exchangeRates[selectedCurrency]) {
        exchangeRateInput.value = exchangeRates[selectedCurrency];
        if (exchangeRateHint) {
            exchangeRateHint.innerHTML = '1 외화당 원화 환율 | <span id="calcShippingExchangeRateUpdate">' + 
                (document.getElementById('calcShippingExchangeRateUpdate') ? document.getElementById('calcShippingExchangeRateUpdate').textContent : '-') + 
                '</span>';
        }
        calculateMargin();
    }
}

// 계산기 배송비 환율 가져오기
async function fetchShippingExchangeRatesForCalculator() {
    await fetchExchangeRatesForCalculator();
    updateCalcShippingExchangeRateInput();
}

// 마진율 계산
function calculateMargin() {
    const purchasePrice = parseFloat(document.getElementById('calcPurchasePrice').value) || 0;
    const internationalShipping = parseFloat(document.getElementById('calcInternationalShipping').value) || 0;
    const exchangeRate = parseFloat(document.getElementById('calcExchangeRate').value) || 0;
    const shippingExchangeRate = parseFloat(document.getElementById('calcShippingExchangeRate').value) || 0;
    const salePrice = parseFloat(document.getElementById('calcSalePrice').value) || 0;
    const platformFee = parseFloat(document.getElementById('calcPlatformFee').value) || 0;
    const customsDuty = parseFloat(document.getElementById('calcCustomsDuty').value) || 0;
    const shippingFee = parseFloat(document.getElementById('calcShippingFee').value) || 0;

    // 구매가격 (원화 환산)
    const purchasePriceKRW = purchasePrice * exchangeRate;
    
    // 해외배송비 (원화 환산)
    const shippingKRW = internationalShipping * shippingExchangeRate;
    
    // 플랫폼 수수료
    const platformFeeAmount = salePrice * (platformFee / 100);
    
    // 총 비용 (구매가격 + 해외배송비 + 플랫폼수수료 + 관부과세 + 국내배송비)
    const totalCost = purchasePriceKRW + shippingKRW + platformFeeAmount + customsDuty + shippingFee;
    
    // 순이익
    const profit = salePrice - totalCost;
    
    // 마진률
    const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    // 결과 표시
    document.getElementById('calcResultTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('calcResultProfit').textContent = formatCurrency(profit);
    document.getElementById('calcResultMargin').textContent = margin.toFixed(2) + '%';

    // 이익/손실에 따른 색상 변경
    const profitElement = document.getElementById('calcResultProfit');
    if (profit >= 0) {
        profitElement.className = 'profit';
    } else {
        profitElement.className = 'loss';
    }
}

// 마진율 계산기 초기화
function initializeMarginCalculator() {
    // 닫기 버튼
    const closeBtn = document.querySelector('.calc-close');
    closeBtn.addEventListener('click', closeMarginCalculator);
    
    // 모달 외부 클릭 시 닫기
    const modal = document.getElementById('marginCalculatorModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeMarginCalculator();
        }
    });
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeMarginCalculator();
        }
    });
    
    // 통화 선택 시 환율 자동 입력
    const currencySelect = document.getElementById('calcCurrency');
    currencySelect.addEventListener('change', async function() {
        await fetchExchangeRatesForCalculator();
    });
    
    // 통화 변경 시 자동 환율 입력
    const calcCurrencySelect = document.getElementById('calcCurrency');
    if (calcCurrencySelect) {
        calcCurrencySelect.addEventListener('change', updateCalcExchangeRateInput);
    }
    
    const calcShippingCurrencySelect = document.getElementById('calcShippingCurrency');
    if (calcShippingCurrencySelect) {
        calcShippingCurrencySelect.addEventListener('change', updateCalcShippingExchangeRateInput);
    }
    
    // 환율 업데이트 버튼
    const updateExchangeRateBtn = document.getElementById('calcUpdateExchangeRateBtn');
    updateExchangeRateBtn.addEventListener('click', fetchExchangeRatesForCalculator);
    
    const updateShippingExchangeRateBtn = document.getElementById('calcUpdateShippingExchangeRateBtn');
    if (updateShippingExchangeRateBtn) {
        updateShippingExchangeRateBtn.addEventListener('click', fetchShippingExchangeRatesForCalculator);
    }
    
    // 플랫폼 선택 시 수수료율 자동 설정
    const platformSelect = document.getElementById('calcPlatform');
    const platformFeeInput = document.getElementById('calcPlatformFee');
    
    platformSelect.addEventListener('change', function() {
        const fees = {
            'coupang': 10.0,
            'naver': 5.6,
            'street11': 11.0,
            'gmarket': 12.0,
            'auction': 12.0,
            'direct': 0,
            'custom': 0
        };
        
        platformFeeInput.value = fees[this.value] || 0;
        calculateMargin();
    });
    
    // 실시간 계산을 위한 이벤트 리스너
    const calcInputs = ['calcPurchasePrice', 'calcInternationalShipping', 'calcCurrency', 'calcShippingCurrency',
                       'calcExchangeRate', 'calcShippingExchangeRate', 'calcSalePrice', 
                       'calcPlatformFee', 'calcCustomsDuty', 'calcShippingFee'];
    
    calcInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateMargin);
        }
    });
    
    // 초기화 버튼
    const resetBtn = document.getElementById('resetCalculatorBtn');
    resetBtn.addEventListener('click', function() {
        document.getElementById('calcPurchasePrice').value = '';
        document.getElementById('calcInternationalShipping').value = '0';
        document.getElementById('calcCurrency').value = 'USD';
        document.getElementById('calcShippingCurrency').value = 'KRW';
        document.getElementById('calcExchangeRate').value = '';
        document.getElementById('calcShippingExchangeRate').value = '1.0';
        document.getElementById('calcSalePrice').value = '';
        document.getElementById('calcPlatform').value = 'coupang';
        document.getElementById('calcPlatformFee').value = '10.0';
        document.getElementById('calcCustomsDuty').value = '0';
        document.getElementById('calcShippingFee').value = '5000';
        
        document.getElementById('calcResultTotalCost').textContent = '0원';
        document.getElementById('calcResultProfit').textContent = '0원';
        document.getElementById('calcResultProfit').className = 'profit';
        document.getElementById('calcResultMargin').textContent = '0%';
    });
}

// ========================================
// 동적 드롭다운 관리
// ========================================

// 커스텀 드롭다운 항목 로드
async function loadCustomDropdownItems() {
    if (!currentUser) {
        console.warn('⚠️ 로그인 필요');
        return;
    }
    
    let customBrands = [];
    let customSites = [];
    
    const userId = currentUser.uid;
    
    // 암호화 키가 있을 때만 데이터 로드
    if (encryptionKey) {
        // Firebase에서 커스텀 아이템 로드
        if (isFirebaseEnabled) {
            try {
                const brandsDoc = await db.collection('customDropdowns').doc(`brands_${userId}`).get();
                const sitesDoc = await db.collection('customDropdowns').doc(`sites_${userId}`).get();
                
                if (brandsDoc.exists) {
                    const data = brandsDoc.data();
                    // 암호화된 데이터 복호화
                    if (data.encryptedList) {
                        customBrands = decryptData(data.encryptedList) || [];
                    } else {
                        // 이전 버전 (암호화 안됨)
                        customBrands = data.list || [];
                    }
                }
                if (sitesDoc.exists) {
                    const data = sitesDoc.data();
                    // 암호화된 데이터 복호화
                    if (data.encryptedList) {
                        customSites = decryptData(data.encryptedList) || [];
                    } else {
                        // 이전 버전 (암호화 안됨)
                        customSites = data.list || [];
                    }
                }
                
                console.log('✅ Firebase에서 커스텀 드롭다운 로드 완료 (복호화):', { customBrands, customSites });
            } catch (error) {
                console.error('❌ Firebase 로드 실패, 로컬스토리지 사용:', error);
                const brandsEncrypted = localStorage.getItem(`customBrands_${userId}`);
                const sitesEncrypted = localStorage.getItem(`customSites_${userId}`);
                
                if (brandsEncrypted) {
                    customBrands = decryptData(JSON.parse(brandsEncrypted)) || [];
                }
                if (sitesEncrypted) {
                    customSites = decryptData(JSON.parse(sitesEncrypted)) || [];
                }
            }
        } else {
            // Firebase 비활성화 시 로컬스토리지 사용
            const brandsEncrypted = localStorage.getItem(`customBrands_${userId}`);
            const sitesEncrypted = localStorage.getItem(`customSites_${userId}`);
            
            if (brandsEncrypted) {
                customBrands = decryptData(JSON.parse(brandsEncrypted)) || [];
            }
            if (sitesEncrypted) {
                customSites = decryptData(JSON.parse(sitesEncrypted)) || [];
            }
        }
    } else {
        console.warn('⚠️ 암호화 키가 없습니다. 데이터를 로드할 수 없습니다.');
    }
    
    // 브랜드 로드
    const brandSelect = document.getElementById('brand');
    const customOption = brandSelect.querySelector('option[value="custom"]');
    
    customBrands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.insertBefore(option, customOption);
    });

    // 브랜드 필터 datalist에 모달의 기본 브랜드 추가
    const brandList = document.getElementById('brandList');
    // 모달의 기본 브랜드 옵션 가져오기 (custom 제외)
    Array.from(brandSelect.options).forEach(opt => {
        if (opt.value && opt.value !== 'custom' && opt.value !== '') {
            const option = document.createElement('option');
            option.value = opt.value;
            brandList.appendChild(option);
        }
    });

    // 구매사이트 로드
    const siteSelect = document.getElementById('purchaseSite');
    const otherOption = siteSelect.querySelector('option[value="other"]');
    
    customSites.forEach(site => {
        const option = document.createElement('option');
        option.value = site;
        option.textContent = site;
        siteSelect.insertBefore(option, otherOption);
    });

    // 구매사이트 필터 datalist에 모달의 기본 사이트 추가 (기타 항목 앞에)
    const siteList = document.getElementById('siteList');
    const otherSiteOption = Array.from(siteList.options).find(opt => opt.value === 'other');
    
    // 모달의 기본 사이트 옵션 가져오기 (other 제외)
    Array.from(siteSelect.options).forEach(opt => {
        if (opt.value && opt.value !== 'other' && opt.value !== '') {
            const option = document.createElement('option');
            option.value = opt.value;
            if (otherSiteOption) {
                siteList.insertBefore(option, otherSiteOption);
            } else {
                siteList.appendChild(option);
            }
        }
    });

    // 브랜드 추가 버튼 이벤트
    document.getElementById('addBrandBtn').addEventListener('click', function() {
        const newBrand = prompt('새 브랜드 이름을 입력하세요:');
        if (newBrand && newBrand.trim()) {
            const brandName = newBrand.trim();
            addCustomBrand(brandName);
        }
    });

    // 브랜드 삭제 버튼 이벤트
    document.getElementById('removeBrandBtn').addEventListener('click', function() {
        const brandSelect = document.getElementById('brand');
        const selectedBrand = brandSelect.value;
        
        if (!selectedBrand || selectedBrand === '' || selectedBrand === 'custom') {
            alert('삭제할 브랜드를 선택하세요.');
            return;
        }
        
        // 기본 제공 브랜드는 삭제 불가
        const defaultBrands = ['Nike', 'Adidas', 'Apple', 'Samsung', 'Sony'];
        if (defaultBrands.includes(selectedBrand)) {
            alert('기본 제공 브랜드는 삭제할 수 없습니다.');
            return;
        }
        
        removeCustomBrand(selectedBrand);
    });

    // 구매사이트 추가 버튼 이벤트
    document.getElementById('addSiteBtn').addEventListener('click', function() {
        const newSite = prompt('새 구매사이트 이름을 입력하세요:');
        if (newSite && newSite.trim()) {
            const siteName = newSite.trim();
            addCustomSite(siteName);
        }
    });

    // 구매사이트 삭제 버튼 이벤트
    document.getElementById('removeSiteBtn').addEventListener('click', function() {
        const siteSelect = document.getElementById('purchaseSite');
        const selectedSite = siteSelect.value;
        
        if (!selectedSite || selectedSite === '' || selectedSite === 'other') {
            alert('삭제할 구매사이트를 선택하세요.');
            return;
        }
        
        // 기본 제공 사이트는 삭제 불가
        const defaultSites = ['amazon', 'ebay', 'aliexpress', 'rakuten', 'iherb', 'costco'];
        if (defaultSites.includes(selectedSite)) {
            alert('기본 제공 구매사이트는 삭제할 수 없습니다.');
            return;
        }
        
        removeCustomSite(selectedSite);
    });

    // 브랜드 선택 이벤트
    brandSelect.addEventListener('change', function() {
        const customInput = document.getElementById('brandCustom');
        if (this.value === 'custom') {
            customInput.style.display = 'block';
            customInput.required = true;
        } else {
            customInput.style.display = 'none';
            customInput.required = false;
            customInput.value = '';
        }
    });
}

// 커스텀 브랜드 추가
async function addCustomBrand(brandName) {
    if (!currentUser) return;
    
    if (!encryptionKey) {
        alert('암호화 키가 없습니다. 다시 로그인해주세요.');
        return;
    }
    
    let customBrands = [];
    const userId = currentUser.uid;
    
    // Firebase에서 현재 목록 가져오기
    if (isFirebaseEnabled) {
        try {
            const brandsDoc = await db.collection('customDropdowns').doc(`brands_${userId}`).get();
            if (brandsDoc.exists) {
                const data = brandsDoc.data();
                // 암호화된 데이터 복호화
                if (data.encryptedList) {
                    customBrands = decryptData(data.encryptedList) || [];
                } else {
                    customBrands = data.list || [];
                }
            }
        } catch (error) {
            console.error('❌ Firebase 로드 실패, 로컬스토리지 사용:', error);
            const encrypted = localStorage.getItem(`customBrands_${userId}`);
            if (encrypted) {
                customBrands = decryptData(JSON.parse(encrypted)) || [];
            }
        }
    } else {
        const encrypted = localStorage.getItem(`customBrands_${userId}`);
        if (encrypted) {
            customBrands = decryptData(JSON.parse(encrypted)) || [];
        }
    }
    
    // 중복 체크
    if (customBrands.includes(brandName)) {
        alert('이미 존재하는 브랜드입니다.');
        return;
    }

    customBrands.push(brandName);
    
    // Firebase에 저장 (암호화)
    if (isFirebaseEnabled) {
        try {
            const encryptedList = encryptData(customBrands);
            await db.collection('customDropdowns').doc(`brands_${userId}`).set({
                encryptedList: encryptedList,
                userId: userId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Firebase에 브랜드 저장 완료 (암호화)');
        } catch (error) {
            console.error('❌ Firebase 저장 실패, 로컬스토리지에 저장:', error);
            const encryptedList = encryptData(customBrands);
            localStorage.setItem(`customBrands_${userId}`, JSON.stringify(encryptedList));
        }
    } else {
        const encryptedList = encryptData(customBrands);
        localStorage.setItem(`customBrands_${userId}`, JSON.stringify(encryptedList));
    }

    // 폼 드롭다운에 추가 (직접 입력 앞에)
    const brandSelect = document.getElementById('brand');
    const customOption = brandSelect.querySelector('option[value="custom"]');
    const newOption = document.createElement('option');
    newOption.value = brandName;
    newOption.textContent = brandName;
    brandSelect.insertBefore(newOption, customOption);

    // 필터 datalist에도 추가
    const brandList = document.getElementById('brandList');
    const filterOption = document.createElement('option');
    filterOption.value = brandName;
    brandList.appendChild(filterOption);

    // 방금 추가한 항목 선택
    brandSelect.value = brandName;
    
    alert(`"${brandName}" 브랜드가 추가되었습니다!`);
}

// 커스텀 구매사이트 추가
async function addCustomSite(siteName) {
    if (!currentUser) return;
    
    if (!encryptionKey) {
        alert('암호화 키가 없습니다. 다시 로그인해주세요.');
        return;
    }
    
    let customSites = [];
    const userId = currentUser.uid;
    
    // Firebase에서 현재 목록 가져오기
    if (isFirebaseEnabled) {
        try {
            const sitesDoc = await db.collection('customDropdowns').doc(`sites_${userId}`).get();
            if (sitesDoc.exists) {
                const data = sitesDoc.data();
                // 암호화된 데이터 복호화
                if (data.encryptedList) {
                    customSites = decryptData(data.encryptedList) || [];
                } else {
                    customSites = data.list || [];
                }
            }
        } catch (error) {
            console.error('❌ Firebase 로드 실패, 로컬스토리지 사용:', error);
            const encrypted = localStorage.getItem(`customSites_${userId}`);
            if (encrypted) {
                customSites = decryptData(JSON.parse(encrypted)) || [];
            }
        }
    } else {
        const encrypted = localStorage.getItem(`customSites_${userId}`);
        if (encrypted) {
            customSites = decryptData(JSON.parse(encrypted)) || [];
        }
    }
    
    // 중복 체크
    if (customSites.includes(siteName)) {
        alert('이미 존재하는 구매사이트입니다.');
        return;
    }

    customSites.push(siteName);
    
    // Firebase에 저장 (암호화)
    if (isFirebaseEnabled) {
        try {
            const encryptedList = encryptData(customSites);
            await db.collection('customDropdowns').doc(`sites_${userId}`).set({
                encryptedList: encryptedList,
                userId: userId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Firebase에 구매사이트 저장 완료 (암호화)');
        } catch (error) {
            console.error('❌ Firebase 저장 실패, 로컬스토리지에 저장:', error);
            const encryptedList = encryptData(customSites);
            localStorage.setItem(`customSites_${userId}`, JSON.stringify(encryptedList));
        }
    } else {
        const encryptedList = encryptData(customSites);
        localStorage.setItem(`customSites_${userId}`, JSON.stringify(encryptedList));
    }

    // 폼 드롭다운에 추가 (기타 앞에)
    const siteSelect = document.getElementById('purchaseSite');
    const otherOption = siteSelect.querySelector('option[value="other"]');
    const newOption = document.createElement('option');
    newOption.value = siteName;
    newOption.textContent = siteName;
    siteSelect.insertBefore(newOption, otherOption);

    // 필터 datalist에도 추가 (기타 항목 앞에 삽입)
    const siteList = document.getElementById('siteList');
    // 기타 항목 찾기
    const otherSiteOption = Array.from(siteList.options).find(opt => opt.value === 'other');
    const filterOption = document.createElement('option');
    filterOption.value = siteName;
    if (otherSiteOption) {
        siteList.insertBefore(filterOption, otherSiteOption);
    } else {
        siteList.appendChild(filterOption);
    }

    // 방금 추가한 항목 선택
    siteSelect.value = siteName;
    
    alert(`"${siteName}" 구매사이트가 추가되었습니다!`);
}

// 커스텀 브랜드 삭제
async function removeCustomBrand(brandName) {
    if (!currentUser) return;
    
    if (!encryptionKey) {
        alert('암호화 키가 없습니다. 다시 로그인해주세요.');
        return;
    }
    
    if (!confirm(`"${brandName}" 브랜드를 삭제하시겠습니까?`)) {
        return;
    }

    let customBrands = [];
    const userId = currentUser.uid;
    
    // Firebase에서 현재 목록 가져오기
    if (isFirebaseEnabled) {
        try {
            const brandsDoc = await db.collection('customDropdowns').doc(`brands_${userId}`).get();
            if (brandsDoc.exists) {
                const data = brandsDoc.data();
                // 암호화된 데이터 복호화
                if (data.encryptedList) {
                    customBrands = decryptData(data.encryptedList) || [];
                } else {
                    customBrands = data.list || [];
                }
            }
        } catch (error) {
            console.error('❌ Firebase 로드 실패, 로컬스토리지 사용:', error);
            const encrypted = localStorage.getItem(`customBrands_${userId}`);
            if (encrypted) {
                customBrands = decryptData(JSON.parse(encrypted)) || [];
            }
        }
    } else {
        const encrypted = localStorage.getItem(`customBrands_${userId}`);
        if (encrypted) {
            customBrands = decryptData(JSON.parse(encrypted)) || [];
        }
    }
    
    // 목록에서 제거
    customBrands = customBrands.filter(brand => brand !== brandName);
    
    // Firebase에 저장 (암호화)
    if (isFirebaseEnabled) {
        try {
            const encryptedList = encryptData(customBrands);
            await db.collection('customDropdowns').doc(`brands_${userId}`).set({
                encryptedList: encryptedList,
                userId: userId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Firebase에서 브랜드 삭제 완료 (암호화)');
        } catch (error) {
            console.error('❌ Firebase 삭제 실패, 로컬스토리지에 저장:', error);
            const encryptedList = encryptData(customBrands);
            localStorage.setItem(`customBrands_${userId}`, JSON.stringify(encryptedList));
        }
    } else {
        const encryptedList = encryptData(customBrands);
        localStorage.setItem(`customBrands_${userId}`, JSON.stringify(encryptedList));
    }

    // 폼 드롭다운에서 제거
    const brandSelect = document.getElementById('brand');
    const optionToRemove = Array.from(brandSelect.options).find(opt => opt.value === brandName);
    if (optionToRemove) {
        brandSelect.removeChild(optionToRemove);
    }

    // 필터 datalist에서도 제거
    const brandList = document.getElementById('brandList');
    const filterOptionToRemove = Array.from(brandList.options).find(opt => opt.value === brandName);
    if (filterOptionToRemove) {
        brandList.removeChild(filterOptionToRemove);
    }

    // 첫 번째 항목 선택
    brandSelect.selectedIndex = 0;
    
    alert(`"${brandName}" 브랜드가 삭제되었습니다.`);
}

// 커스텀 구매사이트 삭제
async function removeCustomSite(siteName) {
    if (!currentUser) return;
    
    if (!encryptionKey) {
        alert('암호화 키가 없습니다. 다시 로그인해주세요.');
        return;
    }
    
    if (!confirm(`"${siteName}" 구매사이트를 삭제하시겠습니까?`)) {
        return;
    }

    let customSites = [];
    const userId = currentUser.uid;
    
    // Firebase에서 현재 목록 가져오기
    if (isFirebaseEnabled) {
        try {
            const sitesDoc = await db.collection('customDropdowns').doc(`sites_${userId}`).get();
            if (sitesDoc.exists) {
                const data = sitesDoc.data();
                // 암호화된 데이터 복호화
                if (data.encryptedList) {
                    customSites = decryptData(data.encryptedList) || [];
                } else {
                    customSites = data.list || [];
                }
            }
        } catch (error) {
            console.error('❌ Firebase 로드 실패, 로컬스토리지 사용:', error);
            const encrypted = localStorage.getItem(`customSites_${userId}`);
            if (encrypted) {
                customSites = decryptData(JSON.parse(encrypted)) || [];
            }
        }
    } else {
        const encrypted = localStorage.getItem(`customSites_${userId}`);
        if (encrypted) {
            customSites = decryptData(JSON.parse(encrypted)) || [];
        }
    }
    
    // 목록에서 제거
    customSites = customSites.filter(site => site !== siteName);
    
    // Firebase에 저장 (암호화)
    if (isFirebaseEnabled) {
        try {
            const encryptedList = encryptData(customSites);
            await db.collection('customDropdowns').doc(`sites_${userId}`).set({
                encryptedList: encryptedList,
                userId: userId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Firebase에서 구매사이트 삭제 완료 (암호화)');
        } catch (error) {
            console.error('❌ Firebase 삭제 실패, 로컬스토리지에 저장:', error);
            const encryptedList = encryptData(customSites);
            localStorage.setItem(`customSites_${userId}`, JSON.stringify(encryptedList));
        }
    } else {
        const encryptedList = encryptData(customSites);
        localStorage.setItem(`customSites_${userId}`, JSON.stringify(encryptedList));
    }

    // 폼 드롭다운에서 제거
    const siteSelect = document.getElementById('purchaseSite');
    const optionToRemove = Array.from(siteSelect.options).find(opt => opt.value === siteName);
    if (optionToRemove) {
        siteSelect.removeChild(optionToRemove);
    }

    // 필터 datalist에서도 제거
    const siteList = document.getElementById('siteList');
    const filterOptionToRemove = Array.from(siteList.options).find(opt => opt.value === siteName);
    if (filterOptionToRemove) {
        siteList.removeChild(filterOptionToRemove);
    }

    // 첫 번째 항목 선택
    siteSelect.selectedIndex = 0;
    
    alert(`"${siteName}" 구매사이트가 삭제되었습니다.`);
}

// 필터링된 거래 가져오기
function getFilteredTransactions() {
    // 거래내역 탭의 상세 필터만 적용 (기간 필터 제외)
    
    // 추가 필터 값 가져오기
    const filterBuyerName = document.getElementById('filterBuyerName')?.value.toLowerCase().trim() || '';
    const filterBrand = document.getElementById('filterBrand')?.value.toLowerCase().trim() || '';
    const filterProduct = document.getElementById('filterProduct')?.value.toLowerCase().trim() || '';
    const filterPurchaseSite = document.getElementById('filterPurchaseSite')?.value.trim() || '';
    const filterPlatform = document.getElementById('filterPlatform')?.value || '';
    const filterCurrency = document.getElementById('filterCurrency')?.value || '';
    const filterYear = document.getElementById('filterYear')?.value || '';
    
    return transactions.filter(t => {
        const transactionDate = new Date(t.purchaseDate);
        
        // 상세 필터만 적용 - 브랜드와 구매사이트는 검색 가능 (부분 일치)
        const buyerNameMatch = !filterBuyerName || t.buyerName.toLowerCase().includes(filterBuyerName);
        const brandMatch = !filterBrand || t.brand.toLowerCase().includes(filterBrand);
        const productMatch = !filterProduct || t.productName.toLowerCase().includes(filterProduct);
        // 구매사이트는 정확히 일치하거나 사용자가 직접 입력한 값으로 검색
        const purchaseSiteMatch = !filterPurchaseSite || 
            t.purchaseSite === filterPurchaseSite || 
            (t.purchaseSite === 'other' && t.purchaseSiteCustom && t.purchaseSiteCustom.toLowerCase().includes(filterPurchaseSite.toLowerCase()));
        const platformMatch = !filterPlatform || t.platform === filterPlatform;
        const currencyMatch = !filterCurrency || t.currency === filterCurrency;
        const yearMatch = !filterYear || transactionDate.getFullYear().toString() === filterYear;
        
        return buyerNameMatch && brandMatch && productMatch && 
               purchaseSiteMatch && platformMatch && currencyMatch && yearMatch;
    }).sort((a, b) => {
        // 구매일자 기준 내림차순 정렬 (최신이 먼저)
        return new Date(b.purchaseDate) - new Date(a.purchaseDate);
    });
}

// 통계 전용 필터링 (기간 필터만 적용, 거래내역 필터는 무시)
function getStatisticsFilteredTransactions() {
    const periodFilter = document.getElementById('statisticsPeriodFilter').value;
    const now = new Date();
    
    return transactions.filter(t => {
        const transactionDate = new Date(t.purchaseDate);
        
        // 기간 필터만 적용
        let periodMatch = true;
        switch(periodFilter) {
            case 'today':
                periodMatch = isSameDay(transactionDate, now);
                break;
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                periodMatch = transactionDate >= weekAgo;
                break;
            case 'month':
                periodMatch = transactionDate.getMonth() === now.getMonth() && 
                       transactionDate.getFullYear() === now.getFullYear();
                break;
            case 'quarter':
                const threeMonthsAgo = new Date(now);
                threeMonthsAgo.setMonth(now.getMonth() - 3);
                periodMatch = transactionDate >= threeMonthsAgo;
                break;
            case 'halfYear':
                const sixMonthsAgo = new Date(now);
                sixMonthsAgo.setMonth(now.getMonth() - 6);
                periodMatch = transactionDate >= sixMonthsAgo;
                break;
            case 'year':
                periodMatch = transactionDate.getFullYear() === now.getFullYear();
                break;
            case 'custom':
                const startDate = new Date(document.getElementById('startDate').value);
                const endDate = new Date(document.getElementById('endDate').value);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    periodMatch = true;
                } else {
                    periodMatch = transactionDate >= startDate && transactionDate <= endDate;
                }
                break;
            case 'all':
            default:
                periodMatch = true;
        }
        
        return periodMatch;
    });
}

// 버튼 초기화
function initializeButtons() {
    console.log('🔘 initializeButtons 호출됨, isButtonsInitialized:', isButtonsInitialized);
    
    // 이미 초기화되었다면 종료
    if (isButtonsInitialized) {
        console.log('⏭️ 버튼 이미 초기화됨, 건너뜀');
        return;
    }
    
    console.log('✅ 버튼 이벤트 리스너 등록 시작');
    
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    document.getElementById('marginCalculatorBtn').addEventListener('click', openMarginCalculator);
    
    // 필터 입력 필드에 이벤트 리스너 추가
    const filterInputs = ['filterBuyerName', 'filterBrand', 'filterProduct', 
                         'filterPurchaseSite', 'filterPlatform', 'filterCurrency', 'filterYear'];
    
    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', applyTransactionFilters);
            element.addEventListener('change', applyTransactionFilters);
        }
    });
    
    // 초기화 완료 플래그 설정
    isButtonsInitialized = true;
    console.log('✅ 버튼 초기화 완료');
}

// 엑셀 다운로드
function exportToExcel() {
    const filteredTransactions = getFilteredTransactions();
    
    if (filteredTransactions.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }

    let csv = '\ufeff'; // UTF-8 BOM
    csv += '구매일자,구매자명,연락처,배송지주소,브랜드,품명,수량,구매사이트,상품URL,구매가격,구매가격통화,구매가격환율,배송방식,해외배송비,배송비통화,배송비환율,구매가격(원),해외배송비(원),판매가격,판매플랫폼,수수료율(%),수수료(원),관부과세,국내배송비,총비용,순이익,마진률(%)\n';
    
    filteredTransactions.forEach(t => {
        csv += [
            t.purchaseDate,
            t.buyerName,
            t.buyerPhone,
            t.buyerAddress || '',
            t.brand,
            t.productName,
            t.quantity,
            getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom),
            t.purchaseUrl || '',
            t.purchasePrice.toFixed(2),
            t.currency,
            t.exchangeRate.toFixed(2),
            t.shippingMethod === 'direct' ? '직배송' : '배대지',
            (t.internationalShipping || 0).toFixed(2),
            t.shippingCurrency || t.currency,
            (t.shippingExchangeRate || 0).toFixed(2),
            t.purchasePriceKRW.toFixed(0),
            (t.shippingKRW || 0).toFixed(0),
            t.salePrice.toFixed(0),
            getPlatformName(t.platform),
            t.platformFee.toFixed(1),
            t.platformFeeAmount.toFixed(0),
            t.customsDuty.toFixed(0),
            t.shippingFee.toFixed(0),
            t.totalCost.toFixed(0),
            t.profit.toFixed(0),
            t.margin.toFixed(2)
        ].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // 추가 필터 정보 수집 (기간 필터 제외)
    const filterParts = [];
    const today = new Date().toISOString().split('T')[0];
    
    const filterBuyerName = document.getElementById('filterBuyerName')?.value.trim();
    if (filterBuyerName) {
        filterParts.push(filterBuyerName);
    }
    
    const filterBrand = document.getElementById('filterBrand')?.value.trim();
    if (filterBrand) {
        filterParts.push(filterBrand);
    }
    
    const filterProduct = document.getElementById('filterProduct')?.value.trim();
    if (filterProduct) {
        filterParts.push(filterProduct);
    }
    
    const filterPurchaseSite = document.getElementById('filterPurchaseSite')?.value.trim();
    if (filterPurchaseSite) {
        const siteName = getPurchaseSiteName(filterPurchaseSite, '');
        filterParts.push(siteName);
    }
    
    const filterPlatform = document.getElementById('filterPlatform')?.value;
    if (filterPlatform) {
        const platformName = getPlatformName(filterPlatform);
        filterParts.push(platformName);
    }
    
    const filterCurrency = document.getElementById('filterCurrency')?.value;
    if (filterCurrency) {
        filterParts.push(filterCurrency);
    }
    
    const filterYear = document.getElementById('filterYear')?.value;
    if (filterYear) {
        filterParts.push(`${filterYear}년`);
    }
    
    // 필터가 없으면 "전체"로 표시
    const filterString = filterParts.length > 0 ? filterParts.join('_') : '전체';
    const filename = `해외직구거래내역_${filterString}_${today}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 전체 삭제
async function clearAllTransactions() {
    if (transactions.length === 0) {
        alert('삭제할 데이터가 없습니다.');
        return;
    }

    if (confirm('모든 거래 내역을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
        if (confirm('정말로 삭제하시겠습니까?')) {
            // Firebase 전체 삭제 (활성화된 경우)
            if (isFirebaseEnabled) {
                try {
                    await clearFirebase();
                    console.log('✅ Firebase 전체 삭제 완료');
                } catch (error) {
                    console.error('❌ Firebase 전체 삭제 실패, 로컬만 삭제:', error);
                }
            }
            
            // 로컬 데이터 삭제
            transactions = [];
            saveTransactions();
            updateStatistics();
            displayTransactions();
            alert('모든 거래 내역이 삭제되었습니다.');
        }
    }
}

// 유틸리티 함수들
function formatCurrency(amount) {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW'
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

function getPlatformName(platform) {
    const names = {
        'coupang': '쿠팡',
        'naver': '네이버 쇼핑',
        'street11': '11번가',
        'gmarket': 'G마켓',
        'auction': '옥션',
        'direct': '직거래',
        'custom': '기타'
    };
    return names[platform] || platform;
}

function getPurchaseSiteName(site, customName) {
    const names = {
        'amazon': 'Amazon',
        'ebay': 'eBay',
        'aliexpress': 'AliExpress',
        'rakuten': '楽天',
        'iherb': 'iHerb',
        'costco': 'Costco',
        'other': customName || '기타'
    };
    return names[site] || site;
}

// 거래내역 필터 적용 (통계 제외)
function applyTransactionFilters() {
    displayTransactions();
}

// 필터 초기화
function resetFilters() {
    document.getElementById('filterBuyerName').value = '';
    document.getElementById('filterBrand').value = '';
    document.getElementById('filterProduct').value = '';
    document.getElementById('filterPurchaseSite').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterCurrency').value = '';
    document.getElementById('filterYear').value = '';
    
    applyTransactionFilters();
}

// 연도 필터 드롭다운 채우기
function populateYearFilter() {
    const yearSelect = document.getElementById('filterYear');
    if (!yearSelect) return;
    
    // 거래 데이터에서 연도 추출
    const years = new Set();
    transactions.forEach(t => {
        const year = new Date(t.purchaseDate).getFullYear();
        years.add(year);
    });
    
    // 정렬 (최신 연도가 먼저)
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    
    // 현재 선택된 값 저장
    const currentValue = yearSelect.value;
    
    // 드롭다운 업데이트
    yearSelect.innerHTML = '<option value="">전체</option>';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}년`;
        yearSelect.appendChild(option);
    });
    
    // 이전 선택 값 복원
    if (currentValue && sortedYears.includes(parseInt(currentValue))) {
        yearSelect.value = currentValue;
    }
}

// ========================================
// 그래프 관련 함수
// ========================================

let charts = {
    monthly: null,
    purchaseSite: null,
    platform: null,
    currency: null,
    brand: null
};

// 모든 차트 업데이트
function updateCharts(transactions) {
    updateMonthlyChart(transactions);
    updatePurchaseSiteChart(transactions);
    updatePlatformChart(transactions);
    updateCurrencyChart(transactions);
    updateBrandChart(transactions);
}

// 기간별 매출/비용/이익 추이 차트 (일별/주별/월별 자동 전환)
function updateMonthlyChart(transactions) {
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;

    const periodFilter = document.getElementById('statisticsPeriodFilter').value;
    
    // 기간에 따라 적절한 집계 단위 결정
    let groupBy = 'month'; // 기본값: 월별
    let labelFormat = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    let sortLimit = 12; // 최대 표시 개수
    
    // custom (직접입력)인 경우 기간 일수를 계산
    if (periodFilter === 'custom') {
        const startDateInput = document.getElementById('startDate').value;
        const endDateInput = document.getElementById('endDate').value;
        
        if (startDateInput && endDateInput) {
            const startDate = new Date(startDateInput);
            const endDate = new Date(endDateInput);
            const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both dates
            
            if (daysDiff <= 31) {
                // 31일 이내 → 일별
                groupBy = 'day';
                labelFormat = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
                sortLimit = daysDiff;
            } else if (daysDiff <= 93) {
                // 31일 초과 ~ 93일(약 3개월) → 주별
                groupBy = 'week';
                labelFormat = (date) => {
                    const weekNum = Math.ceil(date.getDate() / 7);
                    return `${date.getMonth() + 1}월 ${weekNum}주`;
                };
                sortLimit = Math.ceil(daysDiff / 7);
            } else {
                // 93일 초과 → 월별
                groupBy = 'month';
                labelFormat = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
                sortLimit = Math.ceil(daysDiff / 30);
            }
        }
    } else if (periodFilter === 'week') {
        // 이번 주 → 일별
        groupBy = 'day';
        labelFormat = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
        sortLimit = 7;
    } else if (periodFilter === 'month') {
        // 이번 달 → 일별
        groupBy = 'day';
        labelFormat = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
        sortLimit = 31;
    } else if (periodFilter === 'quarter') {
        // 최근 3개월 → 주별
        groupBy = 'week';
        labelFormat = (date) => {
            const weekNum = Math.ceil(date.getDate() / 7);
            return `${date.getMonth() + 1}월 ${weekNum}주`;
        };
        sortLimit = 13; // 약 13주
    } else {
        // 최근 6개월, 올해, 전체 → 월별
        groupBy = 'month';
        labelFormat = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
        sortLimit = 12;
    }

    // 데이터 집계
    const chartData = {};
    transactions.forEach(t => {
        const date = new Date(t.purchaseDate);
        let key;
        
        if (groupBy === 'day') {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } else if (groupBy === 'week') {
            const weekNum = Math.ceil(date.getDate() / 7);
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-W${weekNum}`;
        } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        
        if (!chartData[key]) {
            chartData[key] = { revenue: 0, cost: 0, profit: 0, date: date };
        }
        
        chartData[key].revenue += t.salePrice;
        chartData[key].cost += t.totalCost;
        chartData[key].profit += t.profit;
    });

    // 정렬 및 제한
    const sortedKeys = Object.keys(chartData).sort().slice(-sortLimit);
    const labels = sortedKeys.map(key => {
        return labelFormat(chartData[key].date);
    });
    
    const revenueData = sortedKeys.map(key => Math.round(chartData[key].revenue));
    const costData = sortedKeys.map(key => Math.round(chartData[key].cost));
    const profitData = sortedKeys.map(key => Math.round(chartData[key].profit));

    if (charts.monthly) {
        charts.monthly.destroy();
    }

    // 차트 제목 동적 변경
    let chartTitle = '매출/비용/이익 추이';
    if (groupBy === 'day') chartTitle = '일별 ' + chartTitle;
    else if (groupBy === 'week') chartTitle = '주별 ' + chartTitle;
    else chartTitle = '월별 ' + chartTitle;

    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '매출',
                    data: revenueData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4
                },
                {
                    label: '비용',
                    data: costData,
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    tension: 0.4
                },
                {
                    label: '순이익',
                    data: profitData,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: chartTitle,
                    font: {
                        size: 14,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(0) + 'K';
                            }
                            return value;
                        }
                    }
                }
            }
        }
    });
}

// 구매사이트별 거래 비율 차트
function updatePurchaseSiteChart(transactions) {
    const ctx = document.getElementById('purchaseSiteChart');
    if (!ctx) return;

    const siteCount = {};
    transactions.forEach(t => {
        const siteName = getPurchaseSiteName(t.purchaseSite, t.purchaseSiteCustom);
        siteCount[siteName] = (siteCount[siteName] || 0) + 1;
    });

    const labels = Object.keys(siteCount);
    const data = Object.values(siteCount);
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#4facfe',
        '#43e97b', '#fa709a', '#fee140', '#30cfd0'
    ];

    if (charts.purchaseSite) {
        charts.purchaseSite.destroy();
    }

    charts.purchaseSite = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 판매 플랫폼별 매출 차트
function updatePlatformChart(transactions) {
    const ctx = document.getElementById('platformChart');
    if (!ctx) return;

    const platformRevenue = {};
    transactions.forEach(t => {
        const platformName = getPlatformName(t.platform);
        platformRevenue[platformName] = (platformRevenue[platformName] || 0) + t.salePrice;
    });

    const labels = Object.keys(platformRevenue);
    const data = Object.values(platformRevenue).map(v => Math.round(v));

    if (charts.platform) {
        charts.platform.destroy();
    }

    charts.platform = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '매출: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                }
            }
        }
    });
}

// 통화별 거래 건수 차트
function updateCurrencyChart(transactions) {
    const ctx = document.getElementById('currencyChart');
    if (!ctx) return;

    const currencyCount = {};
    transactions.forEach(t => {
        currencyCount[t.currency] = (currencyCount[t.currency] || 0) + 1;
    });

    const labels = Object.keys(currencyCount);
    const data = Object.values(currencyCount);

    if (charts.currency) {
        charts.currency.destroy();
    }

    charts.currency = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '거래 건수',
                data: data,
                backgroundColor: '#764ba2'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// 브랜드별 Top 10 매출 차트
function updateBrandChart(transactions) {
    const ctx = document.getElementById('brandChart');
    if (!ctx) return;

    const brandRevenue = {};
    transactions.forEach(t => {
        brandRevenue[t.brand] = (brandRevenue[t.brand] || 0) + t.salePrice;
    });

    // 매출 순으로 정렬하고 Top 10만 선택
    const sortedBrands = Object.entries(brandRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedBrands.map(b => b[0]);
    const data = sortedBrands.map(b => Math.round(b[1]));

    if (charts.brand) {
        charts.brand.destroy();
    }

    charts.brand = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: data,
                backgroundColor: '#f093fb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y', // 수평 바 차트
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '매출: ' + formatCurrency(context.parsed.x);
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                }
            }
        }
    });
}

// ========================================
// 회원 승인 관리 함수
// ========================================

// 승인 대기 중인 사용자 목록 로드
async function loadPendingUsers() {
    const container = document.getElementById("pendingUsersList");
    
    try {
        container.innerHTML = "<p style=\"color: #999;\">로딩 중...</p>";
        
        // orderBy 제거 - 클라이언트에서 정렬
        const snapshot = await db.collection("users")
            .where("approved", "==", false)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = "<p style=\"color: #999;\">승인 대기 중인 회원이 없습니다.</p>";
            return;
        }
        
        // 데이터를 배열로 변환하고 날짜순 정렬
        const users = [];
        snapshot.forEach(doc => {
            users.push({
                id: doc.id,
                data: doc.data()
            });
        });
        
        // 최신순 정렬 (createdAt이 없는 경우 맨 뒤로)
        users.sort((a, b) => {
            const dateA = a.data.createdAt ? a.data.createdAt.toDate() : new Date(0);
            const dateB = b.data.createdAt ? b.data.createdAt.toDate() : new Date(0);
            return dateB - dateA; // 내림차순
        });
        
        let html = "";
        users.forEach(userDoc => {
            const user = userDoc.data;
            const createdAt = user.createdAt ? user.createdAt.toDate().toLocaleString("ko-KR") : "-";
            
            html += `
                <div class="pending-user-item" data-uid="${userDoc.id}">
                    <div class="pending-user-info">
                        <strong>${user.businessName || "이름 없음"}</strong>
                        <span>${user.email}</span>
                        <small>가입일: ${createdAt}</small>
                    </div>
                    <div class="pending-user-actions">
                        <button class="btn-approve" onclick="approveUser('${userDoc.id}')">✅ 승인</button>
                        <button class="btn-reject" onclick="rejectUser('${userDoc.id}')">❌ 거부</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log(`✅ 승인 대기 목록 로드 완료: ${users.length}명`);
        
    } catch (error) {
        console.error("❌ 승인 대기 목록 로드 오류:", error);
        
        // 상세 오류 메시지 표시
        let errorMsg = "목록을 불러오는데 실패했습니다.";
        if (error.code === 'permission-denied') {
            errorMsg = "권한이 없습니다. Firestore 보안 규칙을 확인하세요.";
        } else if (error.code === 'failed-precondition') {
            errorMsg = "Firestore 설정이 필요합니다.";
        }
        
        container.innerHTML = `<p style="color: #dc3545;">${errorMsg}<br><small>${error.message}</small></p>`;
    }
}

// 사용자 승인
async function approveUser(uid) {
    if (!confirm("이 사용자를 승인하시겠습니까?")) {
        return;
    }
    
    try {
        const adminEmail = auth.currentUser.email;
        
        await db.collection("users").doc(uid).update({
            approved: true,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: adminEmail
        });
        
        console.log("✅ 사용자 승인 완료:", uid);
        alert("승인되었습니다!");
        
        // 목록 새로고침
        await loadPendingUsers();
        
    } catch (error) {
        console.error("❌ 승인 오류:", error);
        alert("승인에 실패했습니다.\n" + error.message);
    }
}

// 사용자 거부 (계정 삭제)
async function rejectUser(uid) {
    if (!confirm("이 사용자를 거부하시겠습니까?\n\n계정이 완전히 삭제됩니다.")) {
        return;
    }
    
    try {
        // Firestore에서 사용자 정보 삭제
        await db.collection("users").doc(uid).delete();
        
        console.log("✅ 사용자 거부 완료:", uid);
        alert("거부되었습니다. 해당 계정이 삭제되었습니다.");
        
        // 목록 새로고침
        await loadPendingUsers();
        
    } catch (error) {
        console.error("❌ 거부 오류:", error);
        alert("거부에 실패했습니다.\n" + error.message);
    }
}

