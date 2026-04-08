/**
 * Acceptance Tests: Family Group Module
 * User Stories: US-004 ~ US-007
 * Sprint: 1
 */
import { describe, test } from 'vitest'

describe('US-004: Create Family Group', () => {
  test.todo('parent can create family group with name')
  test.todo('creator becomes OWNER')
  test.todo('generates 6-char invite code valid for 24 hours')
  test.todo('generated invite code is 6 characters, alphanumeric')
  test.todo('invite code is unique across all families')
  test.todo('invite code expires after 24 hours')
  test.todo('regenerating invite code invalidates old code')
  test.todo('parent can create multiple groups')
})

describe('US-005: Invite Members', () => {
  test.todo('member joins via invite code')
  test.todo('parent joins as MEMBER, student joins as bound student')
  test.todo('expired code shows error')
  test.todo('duplicate join shows error')
})

describe('US-006: Manage Members', () => {
  test.todo('owner can view member list')
  test.todo('owner can remove members (except self)')
  test.todo('member can leave group')
  test.todo('owner must transfer or disband before leaving')
})

describe('US-007: Switch Student View', () => {
  test.todo('parent can switch between students')
  test.todo('switching updates all data views')
  test.todo('empty group prompts to invite student')
  test.todo('remembers last viewed student')
})
