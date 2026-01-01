# 🔐 회원 승인 시스템 가이드

## 📋 개요

관리자가 승인해야만 로그인할 수 있는 회원 승인 시스템이 추가되었습니다.

## 👑 관리자 설정

### 관리자 이메일 등록
**Script.js** 파일에서 관리자 이메일을 설정하세요:

```javascript
// 관리자 이메일 설정 (46번 줄 근처)
const ADMIN_EMAILS = [
    'jisa861@gmail.com',  // 현재 등록된 관리자
    // 'admin2@example.com',  // 추가 관리자가 필요하면 여기 추가
];
```

**중요:** 관리자 이메일을 변경하려면 위 배열에 이메일을 추가/수정하세요.

## 🚀 작동 방식

### 1. 일반 사용자 회원가입

```
사용자 회원가입
    ↓
Firestore에 사용자 정보 저장
 - approved: false (승인 대기)
 - isAdmin: false
    ↓
"관리자 승인 후 로그인 가능" 안내 메시지
    ↓
로그인 시도 → 승인 대기 메시지 + 자동 로그아웃
```

### 2. 관리자 회원가입

```
관리자 회원가입 (ADMIN_EMAILS에 등록된 이메일)
    ↓
Firestore에 사용자 정보 저장
 - approved: true (자동 승인)
 - isAdmin: true
    ↓
"바로 로그인 가능" 안내 메시지
    ↓
즉시 로그인 가능
```

### 3. 관리자의 승인 프로세스

```
관리자 로그인
    ↓
⚙️ 계정 정보 클릭
    ↓
"👥 회원 승인 관리" 섹션 표시
    ↓
승인 대기 목록 확인
    ↓
✅ 승인 또는 ❌ 거부
```

## 📊 Firestore 데이터 구조

### users 컬렉션

```javascript
{
  email: "user@example.com",          // 사용자 이메일
  businessName: "홍길동 무역",          // 상호명
  approved: false,                     // 승인 여부
  isAdmin: false,                      // 관리자 여부
  createdAt: Timestamp,                // 가입일
  approvedAt: Timestamp | null,        // 승인일 (승인 전에는 null)
  approvedBy: "admin@example.com"      // 승인한 관리자 이메일
}
```

## 🔧 Firebase 설정

### Firestore 보안 규칙

Firebase Console → Firestore Database → Rules에 다음 규칙 추가:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // users 컬렉션
    match /users/{userId} {
      // 자신의 정보는 읽기 가능
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // 회원가입 시 생성 가능
      allow create: if request.auth != null && request.auth.uid == userId;
      
      // 관리자는 모든 users 문서 읽기 가능
      allow read: if request.auth != null && 
                     exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
      
      // 관리자는 승인 상태 업데이트 가능
      allow update: if request.auth != null && 
                       exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
      
      // 관리자는 사용자 삭제 가능 (거부 시)
      allow delete: if request.auth != null && 
                       exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // transactions 컬렉션 (기존 규칙 유지)
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null;
    }
    
    // customDropdowns 컬렉션 (기존 규칙 유지)
    match /customDropdowns/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Firestore 인덱스

Firebase Console에서 다음 복합 인덱스 생성:

**컬렉션:** `users`
- 필드 1: `approved` (오름차순)
- 필드 2: `createdAt` (내림차순)

## 📱 사용자 시나리오

### 시나리오 1: 일반 사용자

```
1. 회원가입
   - 상호명: "홍길동 무역"
   - 이메일: "hong@example.com"
   - 비밀번호: "password123"

2. 회원가입 완료 메시지
   "⚠️ 관리자 승인 후 로그인할 수 있습니다."

3. 로그인 시도
   → "⚠️ 승인 대기 중입니다." 메시지
   → 자동 로그아웃

4. 관리자 승인 후
   → 정상 로그인 가능
```

### 시나리오 2: 관리자

```
1. 로그인

2. ⚙️ 계정 정보 클릭

3. "👥 회원 승인 관리" 섹션 확인

4. 승인 대기 목록에서 사용자 확인:
   ┌─────────────────────────────────┐
   │ 홍길동 무역                       │
   │ hong@example.com                │
   │ 가입일: 2025-01-01 10:30        │
   │ [✅ 승인] [❌ 거부]               │
   └─────────────────────────────────┘

5. ✅ 승인 클릭
   → 사용자 즉시 로그인 가능

   또는

   ❌ 거부 클릭
   → 사용자 계정 완전 삭제
```

## ⚙️ 관리자 기능

### 승인 대기 목록

- **자동 새로고침:** 계정 정보 모달을 열 때마다 최신 목록 로드
- **정렬:** 최근 가입자가 위에 표시
- **정보 표시:**
  - 상호명
  - 이메일
  - 가입일시

### 승인

- 사용자의 `approved` 상태를 `true`로 변경
- `approvedAt`에 승인 시간 기록
- `approvedBy`에 승인한 관리자 이메일 기록
- 사용자 즉시 로그인 가능

### 거부

- Firestore에서 사용자 문서 완전 삭제
- 해당 사용자는 다시 회원가입 필요
- **주의:** 복구 불가능

## 🔍 디버깅

### 콘솔 로그 확인

**회원가입 시:**
```
📝 회원가입 시작: user@example.com
✅ 계정 생성 완료
✅ 상호명 저장 완료: 홍길동 무역
✅ 사용자 정보 Firestore 저장 완료, 승인상태: 대기중
```

**로그인 시 (승인 대기):**
```
✅ 로그인됨: user@example.com
📄 사용자 정보: {approved: false, isAdmin: false, ...}
⚠️ 승인 대기 중인 사용자
```

**로그인 시 (승인됨):**
```
✅ 로그인됨: user@example.com
📄 사용자 정보: {approved: true, isAdmin: false, ...}
✅ 승인된 사용자, 관리자: false
```

## 🚨 문제 해결

### 문제: "승인 대기 목록을 불러오는데 실패했습니다"

**원인:** Firestore 보안 규칙이 설정되지 않음

**해결:**
1. Firebase Console → Firestore → Rules
2. 위의 보안 규칙 복사/붙여넣기
3. "게시" 버튼 클릭

### 문제: "인덱스가 필요합니다" 오류

**원인:** Firestore 복합 인덱스 미생성

**해결:**
1. 콘솔 오류 메시지의 링크 클릭
2. 자동으로 인덱스 생성 페이지로 이동
3. "인덱스 만들기" 클릭
4. 몇 분 후 인덱스 활성화

### 문제: 관리자도 승인 대기 상태로 됨

**원인:** ADMIN_EMAILS에 이메일이 등록되지 않음

**해결:**
```javascript
// Script.js 파일 수정
const ADMIN_EMAILS = [
    'your-admin-email@gmail.com',  // 여기 추가
];
```

## 📌 주요 특징

✅ **자동 승인:** 관리자 이메일은 회원가입 시 자동 승인
✅ **즉시 차단:** 미승인 사용자는 로그인 시 자동 로그아웃
✅ **간편한 관리:** 계정 정보 모달에서 한 번에 관리
✅ **완전 삭제:** 거부 시 사용자 데이터 완전 제거
✅ **감사 추적:** 누가 언제 승인했는지 기록

## 🔒 보안 고려사항

1. **관리자 이메일 보호:** ADMIN_EMAILS는 코드에 하드코딩되어 있으므로 신중하게 관리
2. **Firestore 규칙:** 반드시 보안 규칙을 설정하여 무단 접근 방지
3. **승인 프로세스:** 거부는 복구 불가능하므로 신중하게 결정

## 📞 지원

문제가 발생하면:
1. 브라우저 콘솔(F12) 확인
2. Firestore 보안 규칙 확인
3. 관리자 이메일 설정 확인
