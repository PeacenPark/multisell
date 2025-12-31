# 🔐 로그인 시스템 설정 가이드

## 📋 목차
1. [Firebase 프로젝트 설정](#1-firebase-프로젝트-설정)
2. [Authentication 활성화](#2-authentication-활성화)
3. [Firestore Database 생성](#3-firestore-database-생성)
4. [보안 규칙 설정](#4-보안-규칙-설정)
5. [코드에 설정 적용](#5-코드에-설정-적용)
6. [테스트](#6-테스트)
7. [문제 해결](#7-문제-해결)

---

## 1. Firebase 프로젝트 설정

### 1단계: Firebase Console 접속
```
https://console.firebase.google.com
```

### 2단계: 프로젝트 생성
1. "프로젝트 추가" 클릭
2. 프로젝트 이름 입력 (예: "해외직구관리시스템")
3. Google 애널리틱스 활성화 (선택사항)
4. "프로젝트 만들기" 클릭

### 3단계: 웹 앱 추가
1. 프로젝트 개요 페이지에서 "웹 앱 추가" (</>)  클릭
2. 앱 닉네임 입력 (예: "웹앱")
3. Firebase Hosting 설정 (선택사항)
4. "앱 등록" 클릭

### 4단계: 설정 정보 복사
다음과 같은 설정 정보가 표시됩니다:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcd..."
};
```

**✅ 이 정보를 안전한 곳에 복사해두세요!**

---

## 2. Authentication 활성화

### 1단계: Authentication 페이지 이동
1. 왼쪽 메뉴에서 "Build" > "Authentication" 클릭
2. "시작하기" 버튼 클릭

### 2단계: 로그인 방법 설정
#### 이메일/비밀번호 활성화
1. "Sign-in method" 탭 클릭
2. "이메일/비밀번호" 클릭
3. "사용 설정" 토글 ON
4. "저장" 클릭

#### Google 로그인 활성화
1. "Google" 클릭
2. "사용 설정" 토글 ON
3. "프로젝트 지원 이메일" 선택
4. "저장" 클릭

---

## 3. Firestore Database 생성

### 1단계: Firestore 페이지 이동
1. 왼쪽 메뉴에서 "Build" > "Firestore Database" 클릭
2. "데이터베이스 만들기" 클릭

### 2단계: 데이터베이스 모드 선택
1. **"테스트 모드로 시작"** 선택 (나중에 보안 규칙 설정)
2. "다음" 클릭

### 3단계: 위치 선택
1. **asia-northeast3 (서울)** 선택 권장
2. "사용 설정" 클릭

---

## 4. 보안 규칙 설정 ⚠️ **중요!**

### 1단계: 규칙 편집
1. Firestore Database > "규칙" 탭 클릭
2. 아래 규칙을 복사하여 붙여넣기

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자별 거래 데이터
    match /users/{userId}/transactions/{transactionId} {
      // 인증된 사용자만 자신의 데이터 접근 가능
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
    
    // 사용자별 커스텀 브랜드
    match /users/{userId}/customBrands/{brandId} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
    
    // 사용자별 커스텀 구매사이트
    match /users/{userId}/customSites/{siteId} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
    
    // 사용자별 커스텀 드롭다운 (레거시)
    match /users/{userId}/customDropdowns/{document=**} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
  }
}
```

### 2단계: 규칙 게시
1. "게시" 버튼 클릭
2. 확인 대화상자에서 "게시" 클릭

---

## 5. 코드에 설정 적용

### 파일 1: `auth.js` (17번째 줄부터)
```javascript
const firebaseConfig = {
    apiKey: "여기에 복사한 apiKey 입력",
    authDomain: "여기에 복사한 authDomain 입력",
    projectId: "여기에 복사한 projectId 입력",
    storageBucket: "여기에 복사한 storageBucket 입력",
    messagingSenderId: "여기에 복사한 messagingSenderId 입력",
    appId: "여기에 복사한 appId 입력"
};
```

### 파일 2: `script.js` (17번째 줄부터)
```javascript
const firebaseConfig = {
    apiKey: "auth.js와 동일하게 입력",
    authDomain: "auth.js와 동일하게 입력",
    projectId: "auth.js와 동일하게 입력",
    storageBucket: "auth.js와 동일하게 입력",
    messagingSenderId: "auth.js와 동일하게 입력",
    appId: "auth.js와 동일하게 입력"
};
```

**⚠️ 주의: auth.js와 script.js에 동일한 설정을 입력해야 합니다!**

---

## 6. 테스트

### 1단계: 로그인 페이지 접속
```
auth.html 파일을 브라우저에서 열기
```

### 2단계: 회원가입 테스트
1. "회원가입" 클릭
2. 사업자명, 이메일, 비밀번호 입력
3. "회원가입" 버튼 클릭
4. 자동으로 메인 페이지(index.html)로 이동

### 3단계: Google 로그인 테스트
1. "Google로 로그인" 버튼 클릭
2. Google 계정 선택
3. 권한 허용
4. 자동으로 메인 페이지로 이동

### 4단계: 데이터 확인
1. Firebase Console > Firestore Database
2. users > [user-id] > transactions 경로 확인
3. 거래를 추가하면 자동으로 데이터 생성됨

---

## 7. 문제 해결

### 🔴 "Firebase 설정이 필요합니다" 오류
**원인**: firebaseConfig가 비어있음  
**해결**: auth.js와 script.js에 Firebase 설정 입력

### 🔴 로그인 후 바로 로그아웃됨
**원인**: script.js에서 currentUser를 인식하지 못함  
**해결**: 브라우저 캐시 삭제 후 새로고침

### 🔴 "permission-denied" 오류
**원인**: Firestore 보안 규칙 미설정  
**해결**: 위의 보안 규칙을 정확히 복사/붙여넣기

### 🔴 Google 로그인이 안 됨
**원인 1**: Google 로그인 미활성화  
**해결**: Authentication > Sign-in method에서 Google 활성화

**원인 2**: 승인된 도메인 미등록  
**해결**: Authentication > Settings > 승인된 도메인에 localhost 추가

### 🔴 데이터가 저장 안 됨
**원인**: 사용자 인증 실패 또는 보안 규칙 오류  
**해결**:
1. 브라우저 개발자 도구(F12) > Console 탭에서 오류 확인
2. Firebase Console > Firestore Database > 규칙 탭에서 규칙 재확인

---

## 8. 추가 기능 (선택사항)

### 이메일 인증
사용자가 회원가입 시 이메일 인증을 받도록 설정

`auth.js` 파일의 회원가입 부분 수정:
```javascript
// 이메일 인증 발송 (선택사항) 주석 제거
await user.sendEmailVerification();
```

### 비밀번호 정책 강화
Firebase Console > Authentication > Settings에서:
- 최소 비밀번호 길이 설정
- 특수문자 요구 설정

---

## 9. 보안 체크리스트

✅ Firestore 보안 규칙 설정 완료  
✅ API 키는 공개되어도 안전 (보안 규칙으로 보호)  
✅ 사용자별 데이터 분리 확인  
✅ 테스트 모드에서 프로덕션 모드로 전환  

---

## 10. 데이터 구조

### Firestore 데이터베이스 구조
```
/users
  /{userId}
    /transactions
      /{transactionId}
        - buyerName: "홍길동"
        - brand: "Nike"
        - productName: "에어포스"
        - purchaseDate: "2025-12-30"
        - ... (기타 거래 정보)
        - createdAt: Timestamp
        - updatedAt: Timestamp
    
    /customBrands (선택사항)
      /{brandId}
        - name: "Zara"
    
    /customSites (선택사항)
      /{siteId}
        - name: "Taobao"
```

---

## 📞 지원

문제가 해결되지 않으면:
1. Firebase 공식 문서: https://firebase.google.com/docs
2. Stack Overflow: https://stackoverflow.com/questions/tagged/firebase

---

**🎉 설정 완료!**

이제 여러 사업자가 각자의 계정으로 로그인하여 독립적으로 데이터를 관리할 수 있습니다!
