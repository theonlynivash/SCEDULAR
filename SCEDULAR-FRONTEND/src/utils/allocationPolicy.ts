export interface AllocationBand {
  id: string
  name: string
  minExperience: number
  maxExperience: number | null
  eligibleYears: string[]
  maxTotalPreferences: number
  maxPreferencesPerYear: number
}

export interface AllocationConfig {
  seniorThreshold: number
  bands: AllocationBand[]
  subjectMinExperienceRules?: Record<string, number>
}

export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
  seniorThreshold: 13,
  bands: [
    {
      id: 'band-1',
      name: '0–9 Years (Junior)',
      minExperience: 0,
      maxExperience: 9,
      eligibleYears: ['Year 1', 'Year 2'],
      maxTotalPreferences: 1,
      maxPreferencesPerYear: 1,
    },
    {
      id: 'band-2',
      name: '10–13 Years (Mid-Level)',
      minExperience: 10,
      maxExperience: 13,
      eligibleYears: ['Year 2', 'Year 3', 'Year 4'],
      maxTotalPreferences: 2,
      maxPreferencesPerYear: 1,
    },
    {
      id: 'band-3',
      name: '13+ Years (Senior)',
      minExperience: 13,
      maxExperience: null,
      eligibleYears: ['Year 3', 'Year 4'],
      maxTotalPreferences: 2,
      maxPreferencesPerYear: 1,
    },
  ],
  subjectMinExperienceRules: {},
}

export interface PolicyEvaluation {
  allocationExperience: number | null
  band: AllocationBand
  eligibleYears: string[]
  lockedYears: string[]
  maxTotalPreferences: number
  maxPreferencesPerYear: number
  reasons: Record<string, string>
}

export function getAllocationPolicy(
  allocationExperience: number | null | undefined,
  config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG
): PolicyEvaluation {
  const allYears = ['Year 1', 'Year 2', 'Year 3', 'Year 4']

  if (allocationExperience == null || allocationExperience === undefined || isNaN(Number(allocationExperience))) {
    const unconfiguredBand: AllocationBand = {
      id: 'unconfigured',
      name: 'Experience Not Configured',
      minExperience: 0,
      maxExperience: null,
      eligibleYears: [],
      maxTotalPreferences: 0,
      maxPreferencesPerYear: 0,
    }
    const reasons: Record<string, string> = {}
    for (const year of allYears) {
      reasons[year] = 'Allocation experience not configured. Please configure your allocation experience before selecting subjects.'
    }
    return {
      allocationExperience: null,
      band: unconfiguredBand,
      eligibleYears: [],
      lockedYears: allYears,
      maxTotalPreferences: 0,
      maxPreferencesPerYear: 0,
      reasons,
    }
  }

  const exp = Math.max(0, Number(allocationExperience))

  let matchedBand = config.bands.find(b => {
    if (b.maxExperience === null) {
      return exp >= b.minExperience
    }
    return exp >= b.minExperience && exp < b.maxExperience
  })

  if (!matchedBand) {
    if (exp >= config.seniorThreshold) {
      matchedBand = config.bands[config.bands.length - 1]
    } else {
      matchedBand = config.bands[0]
    }
  }

  const eligibleYears = matchedBand.eligibleYears
  const lockedYears = allYears.filter(y => !eligibleYears.includes(y))
  const reasons: Record<string, string> = {}

  for (const year of lockedYears) {
    reasons[year] = `Not available for your current allocation experience (${exp} years).`
  }

  return {
    allocationExperience: exp,
    band: matchedBand,
    eligibleYears,
    lockedYears,
    maxTotalPreferences: matchedBand.maxTotalPreferences,
    maxPreferencesPerYear: matchedBand.maxPreferencesPerYear,
    reasons,
  }
}
