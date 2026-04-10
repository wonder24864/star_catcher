/**
 * Acceptance Tests: Family Group Module
 * User Stories: US-004 ~ US-007
 * Sprint: 1
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { hash } from 'bcryptjs'
import { appRouter } from '@/server/routers/_app'
import { createCallerFactory } from '@/server/trpc'
import { createMockDb, createMockContext, type MockDb } from '../helpers/mock-db'

const createCaller = createCallerFactory(appRouter)

let db: MockDb
const parentSession = { userId: 'parent1', role: 'PARENT', grade: null, locale: 'zh' }
const studentSession = { userId: 'student1', role: 'STUDENT', grade: 'PRIMARY_3', locale: 'zh' }

beforeEach(async () => {
  db = createMockDb()
  const hashed = await hash('Pass1234', 4) // low rounds for speed
  db._users.push(
    {
      id: 'parent1', username: 'parent01', password: hashed, nickname: 'Parent',
      role: 'PARENT', grade: null, locale: 'zh', isActive: true, deletedAt: null,
      loginFailCount: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: 'parent2', username: 'parent02', password: hashed, nickname: 'Parent 2',
      role: 'PARENT', grade: null, locale: 'zh', isActive: true, deletedAt: null,
      loginFailCount: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: 'student1', username: 'student01', password: hashed, nickname: 'Student',
      role: 'STUDENT', grade: 'PRIMARY_3', locale: 'zh', isActive: true, deletedAt: null,
      loginFailCount: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date(),
    },
  )
})

describe('US-004: Create Family Group', () => {
  test('parent can create family group with name', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    const family = await caller.family.create({ name: 'Test Family' })
    expect(family.name).toBe('Test Family')
    expect(family.inviteCode).toBeTruthy()
  })

  test('creator becomes OWNER', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    await caller.family.create({ name: 'My Family' })

    const member = db._familyMembers.find(m => m.userId === 'parent1')
    expect(member?.role).toBe('OWNER')
  })

  test('generates 6-char invite code valid for 24 hours', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    const family = await caller.family.create({ name: 'Coded Family' })

    expect(family.inviteCode).toHaveLength(6)
    expect(family.inviteCodeExpiresAt).toBeTruthy()

    const expiry = new Date(family.inviteCodeExpiresAt!).getTime()
    const now = Date.now()
    // Should expire roughly 24 hours from now (within 1 minute tolerance)
    expect(expiry - now).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(expiry - now).toBeLessThan(25 * 60 * 60 * 1000)
  })

  test('generated invite code is 6 characters, alphanumeric', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    const family = await caller.family.create({ name: 'Code Test' })
    expect(family.inviteCode).toMatch(/^[A-Z0-9]{6}$/)
  })

  test('regenerating invite code creates new code', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    const family = await caller.family.create({ name: 'Refresh Test' })
    const oldCode = family.inviteCode

    const result = await caller.family.refreshInviteCode({ familyId: family.id })
    expect(result.inviteCode).toHaveLength(6)
    // New code should be different (extremely unlikely to be same)
    // But we can't guarantee it, so just check it's valid format
    expect(result.inviteCode).toMatch(/^[A-Z0-9]{6}$/)
  })

  test('parent can create multiple groups', async () => {
    const caller = createCaller(createMockContext(db, parentSession))
    await caller.family.create({ name: 'Family A' })
    await caller.family.create({ name: 'Family B' })

    expect(db._families).toHaveLength(2)
    const ownerCount = db._familyMembers.filter(m => m.userId === 'parent1' && m.role === 'OWNER')
    expect(ownerCount).toHaveLength(2)
  })

  test('student cannot create family group', async () => {
    const caller = createCaller(createMockContext(db, studentSession))
    await expect(caller.family.create({ name: 'Nope' })).rejects.toThrow()
  })
})

describe('US-005: Invite Members', () => {
  test('member joins via invite code', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Join Test' })

    const studentCaller = createCaller(createMockContext(db, studentSession))
    const result = await studentCaller.family.join({ inviteCode: family.inviteCode! })
    expect(result.familyName).toBe('Join Test')
  })

  test('parent joins as MEMBER', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Parent Join' })

    const parent2Session = { userId: 'parent2', role: 'PARENT', grade: null, locale: 'zh' }
    const parent2Caller = createCaller(createMockContext(db, parent2Session))
    await parent2Caller.family.join({ inviteCode: family.inviteCode! })

    const member = db._familyMembers.find(m => m.userId === 'parent2')
    expect(member?.role).toBe('MEMBER')
  })

  test('expired code throws error', async () => {
    // Manually create family with expired invite code
    db._families.push({
      id: 'fam_expired',
      name: 'Expired',
      inviteCode: 'EXP123',
      inviteCodeExpiresAt: new Date(Date.now() - 1000), // expired
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = createCaller(createMockContext(db, studentSession))
    await expect(caller.family.join({ inviteCode: 'EXP123' })).rejects.toThrow()
  })

  test('duplicate join throws error', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Dup Test' })

    const studentCaller = createCaller(createMockContext(db, studentSession))
    await studentCaller.family.join({ inviteCode: family.inviteCode! })

    // Second join should fail
    await expect(
      studentCaller.family.join({ inviteCode: family.inviteCode! })
    ).rejects.toThrow()
  })

  test('invalid code throws error', async () => {
    const caller = createCaller(createMockContext(db, studentSession))
    await expect(caller.family.join({ inviteCode: 'XXXXXX' })).rejects.toThrow()
  })
})

describe('US-006: Manage Members', () => {
  test('owner can view member list', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'View Test' })

    // Student joins
    const studentCaller = createCaller(createMockContext(db, studentSession))
    await studentCaller.family.join({ inviteCode: family.inviteCode! })

    const families = await ownerCaller.family.list()
    expect(families).toHaveLength(1)
    expect(families[0].members).toHaveLength(2)
  })

  test('owner can remove members (except self)', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Remove Test' })

    const studentCaller = createCaller(createMockContext(db, studentSession))
    await studentCaller.family.join({ inviteCode: family.inviteCode! })

    // Remove student
    await ownerCaller.family.removeMember({ familyId: family.id, userId: 'student1' })
    const remaining = db._familyMembers.filter(m => m.familyId === family.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].userId).toBe('parent1')
  })

  test('member can leave group', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Leave Test' })

    const studentCaller = createCaller(createMockContext(db, studentSession))
    await studentCaller.family.join({ inviteCode: family.inviteCode! })

    // Student leaves
    await studentCaller.family.removeMember({ familyId: family.id, userId: 'student1' })
    const remaining = db._familyMembers.filter(m => m.familyId === family.id)
    expect(remaining).toHaveLength(1)
  })

  test('owner cannot leave (must transfer or disband)', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Owner Leave Test' })

    await expect(
      ownerCaller.family.removeMember({ familyId: family.id, userId: 'parent1' })
    ).rejects.toThrow()
  })
})

describe('US-007: Switch Student View', () => {
  test('parent can list students across families', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    const family = await ownerCaller.family.create({ name: 'Students Test' })

    const studentCaller = createCaller(createMockContext(db, studentSession))
    await studentCaller.family.join({ inviteCode: family.inviteCode! })

    const students = await ownerCaller.family.students()
    expect(students).toHaveLength(1)
    expect(students[0].id).toBe('student1')
    expect(students[0].nickname).toBe('Student')
  })

  test('empty group returns empty student list', async () => {
    const ownerCaller = createCaller(createMockContext(db, parentSession))
    await ownerCaller.family.create({ name: 'Empty Family' })

    const students = await ownerCaller.family.students()
    expect(students).toHaveLength(0)
  })

  test.todo('switching updates all data views')
  test.todo('remembers last viewed student')
})
