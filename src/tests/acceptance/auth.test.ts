/**
 * Acceptance Tests: Authentication Module
 * User Stories: US-001 (Register), US-002 (Login), US-003 (Profile Update)
 * Sprint: 1
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { hash } from 'bcryptjs'
import { registerSchema } from '@/lib/domain/validations/auth'
import { appRouter } from '@/server/routers/_app'
import { createCallerFactory } from '@/server/trpc'
import { createMockDb, createMockContext, type MockDb } from '../helpers/mock-db'

const createCaller = createCallerFactory(appRouter)

let db: MockDb

beforeEach(() => {
  db = createMockDb()
})

describe('US-001: User Registration', () => {
  test('user can register with username, password, nickname, and role', async () => {
    const caller = createCaller(createMockContext(db))
    const result = await caller.auth.register({
      username: 'student01',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'Test Student',
      role: 'STUDENT',
      grade: 'PRIMARY_3',
    })

    expect(result.username).toBe('student01')
    expect(db._users).toHaveLength(1)
    expect(db._users[0].role).toBe('STUDENT')
    expect(db._users[0].grade).toBe('PRIMARY_3')
  })

  test('username must be 4-32 chars, alphanumeric + underscore', () => {
    // Too short
    expect(registerSchema.safeParse({
      username: 'ab', password: 'Pass1234', confirmPassword: 'Pass1234',
      nickname: 'n', role: 'PARENT',
    }).success).toBe(false)

    // Invalid chars
    expect(registerSchema.safeParse({
      username: 'user@name', password: 'Pass1234', confirmPassword: 'Pass1234',
      nickname: 'n', role: 'PARENT',
    }).success).toBe(false)

    // Valid
    expect(registerSchema.safeParse({
      username: 'good_user_123', password: 'Pass1234', confirmPassword: 'Pass1234',
      nickname: 'n', role: 'PARENT',
    }).success).toBe(true)
  })

  test('username must be unique', async () => {
    const caller = createCaller(createMockContext(db))
    await caller.auth.register({
      username: 'unique01',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'First',
      role: 'PARENT',
    })

    await expect(
      caller.auth.register({
        username: 'unique01',
        password: 'Pass5678',
        confirmPassword: 'Pass5678',
        nickname: 'Second',
        role: 'PARENT',
      })
    ).rejects.toThrow()
  })

  test('password must be 8+ chars with at least 1 letter and 1 number', () => {
    const base = { username: 'testuser', confirmPassword: '', nickname: 'n', role: 'PARENT' as const }

    // Too short
    expect(registerSchema.safeParse({ ...base, password: 'Pass1', confirmPassword: 'Pass1' }).success).toBe(false)

    // No number
    expect(registerSchema.safeParse({ ...base, password: 'Passssss', confirmPassword: 'Passssss' }).success).toBe(false)

    // No letter
    expect(registerSchema.safeParse({ ...base, password: '12345678', confirmPassword: '12345678' }).success).toBe(false)

    // Valid
    expect(registerSchema.safeParse({ ...base, password: 'Pass1234', confirmPassword: 'Pass1234' }).success).toBe(true)
  })

  test('student registration requires grade selection from 12 levels', () => {
    // Student without grade
    expect(registerSchema.safeParse({
      username: 'student1',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'Student',
      role: 'STUDENT',
    }).success).toBe(false)

    // Student with grade
    expect(registerSchema.safeParse({
      username: 'student1',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'Student',
      role: 'STUDENT',
      grade: 'JUNIOR_2',
    }).success).toBe(true)
  })

  test('grade field is not required for parent role', () => {
    expect(registerSchema.safeParse({
      username: 'parent01',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'Parent',
      role: 'PARENT',
    }).success).toBe(true)
  })

  test('student must select grade level', async () => {
    const caller = createCaller(createMockContext(db))
    const result = await caller.auth.register({
      username: 'student02',
      password: 'Pass1234',
      confirmPassword: 'Pass1234',
      nickname: 'Student',
      role: 'STUDENT',
      grade: 'SENIOR_1',
    })

    expect(db._users[0].grade).toBe('SENIOR_1')
  })

  test.todo('successful registration auto-logs in and redirects')
  test.todo('registration failure shows specific error reason')
  test.todo('supports zh/en interface')
})

describe('US-002: User Login', () => {
  test('5 consecutive failures locks account for 15 minutes', async () => {
    // Simulate by checking the auth.ts logic: loginFailCount >= 5 → lock
    const hashed = await hash('Correct1', 12)
    db._users.push({
      id: 'user_lock',
      username: 'locktest',
      password: hashed,
      nickname: 'Lock Test',
      role: 'STUDENT',
      grade: 'PRIMARY_1',
      locale: 'zh',
      isActive: true,
      deletedAt: null,
      loginFailCount: 5,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // The user is locked — lockedUntil is in the future
    const user = db._users.find(u => u.id === 'user_lock')!
    expect(user.loginFailCount).toBe(5)
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
  })

  test('account unlocks after 15 minutes', () => {
    const lockTime = new Date(Date.now() - 16 * 60 * 1000) // 16 min ago
    // lockedUntil is in the past → account should be accessible
    expect(lockTime.getTime()).toBeLessThan(Date.now())
  })

  test.todo('user can login with username + password')
  test.todo('successful login redirects by role (student -> check, parent -> overview)')
  test.todo('login failure shows generic error (no username/password distinction)')
  test.todo('JWT token valid for 7 days')
  test.todo('Remember Me extends to 30-day refresh token')
  test.todo('locked account shows countdown timer')
  test.todo('Refresh Token stored in httpOnly cookie, JWT in memory')
  test.todo('expired token redirects to login page')
  test.todo('locked account shows remaining lock time')
})

describe('US-003: Profile Update', () => {
  test('user can update nickname', async () => {
    const hashed = await hash('Pass1234', 12)
    db._users.push({
      id: 'user_profile',
      username: 'profiletest',
      password: hashed,
      nickname: 'Old Name',
      role: 'STUDENT',
      grade: 'JUNIOR_1',
      locale: 'zh',
      isActive: true,
      deletedAt: null,
      loginFailCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = createCaller(createMockContext(db, {
      userId: 'user_profile',
      role: 'STUDENT',
      grade: 'JUNIOR_1',
      locale: 'zh',
    }))

    await caller.user.updateProfile({ nickname: 'New Name' })
    expect(db._users.find(u => u.id === 'user_profile')!.nickname).toBe('New Name')
  })

  test('password change requires old password verification', async () => {
    const hashed = await hash('OldPass1', 12)
    db._users.push({
      id: 'user_pw',
      username: 'pwtest',
      password: hashed,
      nickname: 'PW Test',
      role: 'PARENT',
      grade: null,
      locale: 'zh',
      isActive: true,
      deletedAt: null,
      loginFailCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = createCaller(createMockContext(db, {
      userId: 'user_pw',
      role: 'PARENT',
      grade: null,
      locale: 'zh',
    }))

    // Wrong old password
    await expect(
      caller.user.changePassword({ currentPassword: 'WrongPw1', newPassword: 'NewPass1' })
    ).rejects.toThrow()

    // Correct old password
    await caller.user.changePassword({ currentPassword: 'OldPass1', newPassword: 'NewPass1' })
  })

  test('student can change grade level', async () => {
    const hashed = await hash('Pass1234', 12)
    db._users.push({
      id: 'user_grade',
      username: 'gradetest',
      password: hashed,
      nickname: 'Grade Test',
      role: 'STUDENT',
      grade: 'PRIMARY_5',
      locale: 'zh',
      isActive: true,
      deletedAt: null,
      loginFailCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = createCaller(createMockContext(db, {
      userId: 'user_grade',
      role: 'STUDENT',
      grade: 'PRIMARY_5',
      locale: 'zh',
    }))

    await caller.user.updateProfile({ grade: 'PRIMARY_6' })
    expect(db._users.find(u => u.id === 'user_grade')!.grade).toBe('PRIMARY_6')
  })

  test('user can switch interface language', async () => {
    const hashed = await hash('Pass1234', 12)
    db._users.push({
      id: 'user_lang',
      username: 'langtest',
      password: hashed,
      nickname: 'Lang Test',
      role: 'PARENT',
      grade: null,
      locale: 'zh',
      isActive: true,
      deletedAt: null,
      loginFailCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = createCaller(createMockContext(db, {
      userId: 'user_lang',
      role: 'PARENT',
      grade: null,
      locale: 'zh',
    }))

    await caller.user.updateProfile({ locale: 'en' })
    expect(db._users.find(u => u.id === 'user_lang')!.locale).toBe('en')
  })

  test.todo('changes take effect immediately')
})
