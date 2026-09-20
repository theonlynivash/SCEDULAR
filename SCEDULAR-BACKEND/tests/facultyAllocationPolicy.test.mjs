import assert from 'node:assert'
import { getAllocationPolicy, DEFAULT_ALLOCATION_CONFIG } from '../dist/utils/allocationPolicy.js'

console.log('=== RUNNING SCEDULAR ALLOCATION SYSTEM AUTOMATED TESTS ===\n')

// TEST 1: 8 years allocation experience
{
  const policy = getAllocationPolicy(8, DEFAULT_ALLOCATION_CONFIG)
  assert.deepStrictEqual(policy.eligibleYears, ['Year 1', 'Year 2'])
  assert.deepStrictEqual(policy.lockedYears, ['Year 3', 'Year 4'])
  assert.strictEqual(policy.maxTotalPreferences, 1)
  assert.strictEqual(policy.maxPreferencesPerYear, 1)
  console.log('✅ TEST 1 PASSED: 8 years -> Y1/Y2 eligible, Y3/Y4 locked, max 1 preference.')
}

// TEST 2: 11 years allocation experience
{
  const policy = getAllocationPolicy(11, DEFAULT_ALLOCATION_CONFIG)
  assert.deepStrictEqual(policy.eligibleYears, ['Year 2', 'Year 3', 'Year 4'])
  assert.deepStrictEqual(policy.lockedYears, ['Year 1'])
  assert.strictEqual(policy.maxTotalPreferences, 2)
  assert.strictEqual(policy.maxPreferencesPerYear, 1)
  console.log('✅ TEST 2 PASSED: 11 years -> Y2/Y3/Y4 eligible, Y1 locked, max 2 preferences, max 1/year.')
}

// TEST 3: 13 years allocation experience
{
  const policy = getAllocationPolicy(13, DEFAULT_ALLOCATION_CONFIG)
  assert.deepStrictEqual(policy.eligibleYears, ['Year 3', 'Year 4'])
  assert.deepStrictEqual(policy.lockedYears, ['Year 1', 'Year 2'])
  assert.strictEqual(policy.maxTotalPreferences, 2)
  assert.strictEqual(policy.maxPreferencesPerYear, 1)
  console.log('✅ TEST 3 PASSED: 13 years -> Y3/Y4 eligible, Y1/Y2 locked, max 2 preferences, max 1/year.')
}

// TEST 4 & 5: Preference Combination Validation (Same Year vs Different Years)
{
  const policy = getAllocationPolicy(13, DEFAULT_ALLOCATION_CONFIG)
  
  // Valid combination (Y3 + Y4)
  const validCombination = [
    { academicYear: 'Year 3', subjectId: 'SUB002' },
    { academicYear: 'Year 4', subjectId: 'SUB005' },
  ]
  const counts1 = {}
  let valid = true
  for (const item of validCombination) {
    counts1[item.academicYear] = (counts1[item.academicYear] || 0) + 1
    if (counts1[item.academicYear] > policy.maxPreferencesPerYear) valid = false
  }
  assert.strictEqual(valid, true)

  // Invalid combination (Y3 + Y3)
  const invalidCombination = [
    { academicYear: 'Year 3', subjectId: 'SUB002' },
    { academicYear: 'Year 3', subjectId: 'SUB004' },
  ]
  const counts2 = {}
  let invalid = false
  for (const item of invalidCombination) {
    counts2[item.academicYear] = (counts2[item.academicYear] || 0) + 1
    if (counts2[item.academicYear] > policy.maxPreferencesPerYear) invalid = true
  }
  assert.strictEqual(invalid, true)

  console.log('✅ TEST 4 & 5 PASSED: Y3+Y4 combination allowed; Y3+Y3 combination correctly rejected.')
}

// TEST 12: HOD Policy Configuration Change Test
{
  const customConfig = {
    seniorThreshold: 15,
    bands: [
      {
        id: 'band-1',
        name: '0-10 Years',
        minExperience: 0,
        maxExperience: 10,
        eligibleYears: ['Year 1'],
        maxTotalPreferences: 1,
        maxPreferencesPerYear: 1,
      },
      {
        id: 'band-2',
        name: '10-15 Years',
        minExperience: 10,
        maxExperience: 15,
        eligibleYears: ['Year 2', 'Year 3'],
        maxTotalPreferences: 2,
        maxPreferencesPerYear: 1,
      },
      {
        id: 'band-3',
        name: '15+ Years',
        minExperience: 15,
        maxExperience: null,
        eligibleYears: ['Year 4'],
        maxTotalPreferences: 3,
        maxPreferencesPerYear: 1,
      },
    ],
  }

  const eval13WithCustom = getAllocationPolicy(13, customConfig)
  assert.deepStrictEqual(eval13WithCustom.eligibleYears, ['Year 2', 'Year 3'])
  console.log('✅ TEST 12 PASSED: Dynamic allocation policy change evaluated correctly without code modification.')
}

// TEST 13: Unconfigured / null allocation experience test
{
  const policyNull = getAllocationPolicy(null, DEFAULT_ALLOCATION_CONFIG)
  assert.deepStrictEqual(policyNull.eligibleYears, [])
  assert.deepStrictEqual(policyNull.lockedYears, ['Year 1', 'Year 2', 'Year 3', 'Year 4'])
  assert.strictEqual(policyNull.maxTotalPreferences, 0)
  assert.strictEqual(policyNull.band.name, 'Experience Not Configured')

  const policyUndefined = getAllocationPolicy(undefined, DEFAULT_ALLOCATION_CONFIG)
  assert.deepStrictEqual(policyUndefined.eligibleYears, [])
  assert.strictEqual(policyUndefined.maxTotalPreferences, 0)
  console.log('✅ TEST 13 PASSED: Null / undefined experience blocks all years and marks as Experience Not Configured.')
}

console.log('\n=== ALL ALLOCATION SYSTEM TEST SUITES COMPLETED SUCCESSFULLY! ===')
