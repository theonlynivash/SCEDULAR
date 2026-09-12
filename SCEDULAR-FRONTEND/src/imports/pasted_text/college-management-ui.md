Create a professional college/academic management UI.

Use a clean desktop web layout with:

Header at the top
Faculty information section
Experience information
Semester and year selection controls
Subject selection area
Laboratory selection area
Selection summary
Submit button

Use compact cards, tabs, badges, dropdowns, radio buttons, checkboxes, and expandable sections so that the screen remains organized without becoming cluttered.

1. TOP – FACULTY INFORMATION

At the top of the screen display a compact Faculty Information card.

Show:

Faculty Name: Dr. J. Suganya Devi

Department: Artificial Intelligence and Data Science

Previous College Experience: 8 Years

Current College Experience: 7 Years

Total Experience: 15 Years

Keep Previous College Experience and Current College Experience as separate values.

Highlight Total Experience because it determines the number of subject options available.

Example:

┌──────────────────────────────────────────────────────────────┐
│ Faculty: Dr. J. Suganya Devi │
│ Department: AI & Data Science │
│ │
│ Previous College Current College Total Experience │
│ 8 Years 7 Years 15 Years │
└──────────────────────────────────────────────────────────────┘

Show a badge:

Experienced Faculty – Eligible for 2 Options

The badge should automatically depend on total experience.

2. SEMESTER SELECTION

Immediately below the faculty information, provide:

Academic Year
[ 2026–2027 ▼ ]

Semester

[ ODD SEMESTER ] [ EVEN SEMESTER ]

The selected semester should determine which subjects are displayed.

3. YEAR SELECTION

Below the semester selection, provide four compact year tabs:

1st Year | 2nd Year | 3rd Year | 4th Year

When the faculty clicks a year, display only that year's subjects.

Example:

[ 1st Year ] [ 2nd Year ] [ 3rd Year ] [ 4th Year ]

The selected year should be visually highlighted.

Do NOT create separate pages for the four years.

4. SUBJECT TYPE

Inside the same screen, provide two sub-sections:

THEORY
LABORATORY

Use two compact tabs:

[ THEORY ] [ LABORATORY ]

Alternatively, display Theory and Laboratory as two sections side-by-side if space permits.

5. EXPERIENCE-BASED SUBJECT OPTIONS

This is the most important rule in the interface.

The number of subject options depends on the faculty's total experience.

If Total Experience >= 13 Years

Allow the faculty to select TWO subject options for each year.

Example:

1st Year Subject Options

Option 1
[ Select Subject ▼ ]

Option 2
[ Select Subject ▼ ]

If Total Experience < 13 Years

Allow only ONE subject option.

Example:

1st Year Subject Option

Option 1
[ Select Subject ▼ ]

This rule should be clearly visible in the UI.

Show:

Eligibility: 13+ Years → 2 Options

Below 13 Years → 1 Option

6. SUBJECT LIST

Display the available subjects for the selected year and semester as compact cards or rows.

Example:

1st Year – Odd Semester – Theory
Select	Subject	Code	Difficulty	Previous Handling
○	Programming Fundamentals	23AD1101	Normal	2025
○	Mathematics	23AD1102	Normal	2024
🔒	★ Advanced Programming	23AD1103	Tough	—

Each subject should have:

Radio button or selection control
Subject code
Subject name
Difficulty indicator
Previous handling information
7. TOUGH SUBJECTS

Subjects that require experienced faculty must be clearly marked.

Use:

★ Tough

Example:

★ Advanced Machine Learning

★ Deep Learning

★ Advanced Data Structures

Only eligible experienced faculty should be able to select these subjects.

For an ineligible faculty member:

Show the subject in a disabled state.

Example:

🔒 ★ Deep Learning

Experienced Faculty Only

Tooltip:

"This subject can only be selected by faculty meeting the required experience criteria."

For eligible faculty, show:

★ Tough Subject

Eligible

8. LABORATORY SECTION

For the selected year and semester, display the corresponding laboratories.

Example:

Laboratory

○ Programming Laboratory
○ Python Laboratory
○ Data Science Laboratory

Each lab should show:

Lab Code
Lab Name
Related Theory Subject
Previous Year Handled

When the user clicks a theory subject, visually show its related laboratory.

Example:

Theory
Artificial Intelligence

↓ Related Lab

Laboratory
Artificial Intelligence Laboratory

9. SUBJECT DETAIL POPUP / SIDE PANEL

When the faculty clicks a subject, do NOT navigate to another page.

Instead, open a compact modal or right-side drawer within the same screen.

Display:

Subject Details

Subject Code: 23ADxxxx

Subject Name: Advanced Machine Learning

Year: 3rd Year

Semester: Odd

Type: Theory

Difficulty: ★ Tough

Experience Requirement: 13+ Years

Previously Handled: Yes

Previous Handling Year: 2025–26

Related Laboratory:
Advanced Machine Learning Laboratory

Buttons:

[ Select ] [ Cancel ]

10. PREVIOUS SUBJECT HANDLING

Previous subjects handled by the faculty should be displayed directly on this same screen.

Create a compact section:

Previously Handled Subjects
Year	Semester	Subject	Type
2025–26	Odd	Machine Learning	Theory
2024–25	Even	DBMS	Theory
2024–25	Even	DBMS Laboratory	Lab

Use small badges for:

Theory

Lab

This information is for reference while selecting subjects.

11. RIGHT-SIDE SELECTION SUMMARY

Use the right side of the same screen for a compact card:

My Subject Options

1st Year

Programming Fundamentals
Mathematics

2nd Year

Data Structures
DBMS

3rd Year

Machine Learning
Deep Learning ★

4th Year

NLP
Computer Vision
Labs
Programming Lab
Data Structures Lab
Machine Learning Lab

Show:

Theory Selected: 8 / 8

Labs Selected: 3

Status: Ready to Submit ✓

This panel should update dynamically when the faculty selects or removes a subject.

12. SUBMISSION AREA

At the bottom-right of the same screen:

[ Save Draft ] [ Reset ] [ Submit Options ]

Before submission, show a compact confirmation modal:

Confirm Subject Options

"Please verify your selected subjects before final submission."

[ Cancel ] [ Confirm Submission ]

After submission:

✓ Subject options submitted successfully

Status badge:

SUBMITTED

13. IMPORTANT UI RULES

The screen must visually communicate these rules:

Rule 1

Faculty experience is divided into:

13+ Years → 2 subject options

< 13 Years → 1 subject option

Rule 2

Tough subjects are marked:

★ Tough

Rule 3

Only eligible experienced faculty can select tough subjects.

Rule 4

Theory and Laboratory subjects are shown separately.

Rule 5

Only the selected semester's subjects are displayed.

Rule 6

Only the selected year's subjects are displayed.

Rule 7

Previously handled subjects are displayed for reference.

14. RECOMMENDED SINGLE-SCREEN STRUCTURE

Design the screen approximately like this:

┌────────────────────────────────────────────────────────────────────────────┐
│ FACULTY SUBJECT OPTION SELECTION │
├────────────────────────────────────────────────────────────────────────────┤
│ Faculty: Dr. J. Suganya Devi Department: AI & DS │
│ Previous: 8 Yrs Current: 7 Yrs Total: 15 Yrs [2 OPTIONS ELIGIBLE] │
├────────────────────────────────────────────────────────────────────────────┤
│ Academic Year [2026-27 ▼] [ ODD ] [ EVEN ] │
│ │
│ [ 1st Year ] [ 2nd Year ] [ 3rd Year ] [ 4th Year ] │
├───────────────────────────────────────────────────────┬────────────────────┤
│ SUBJECT SELECTION │ MY OPTIONS │
│ │ │
│ [ THEORY ] [ LABORATORY ] │ 1st Year │
│ │ ○ Subject 1 │
│ OPTION 1 [Select Subject ▼] │ ○ Subject 2 │
│ OPTION 2 [Select Subject ▼] │ │
│ │ 2nd Year │
│ Available Subjects │ ○ Subject 1 │
│ │ ○ Subject 2 │
│ ○ Programming Fundamentals │ │
│ ○ Mathematics │ 3rd Year │
│ ★ Deep Learning [TOUGH] [ELIGIBLE] │ ○ Subject 1 │
│ ○ Data Structures │ ★ Subject 2 │
│ │ │
│ 🔒 Advanced AI [EXPERIENCED FACULTY ONLY] │ 4th Year │
│ │ ○ Subject 1 │
│ Related Laboratory │ ○ Subject 2 │
│ → Advanced AI Laboratory │ │
│ │ Labs │
│ Previous Handling │ ✓ Programming Lab │
│ 2025–26 – Machine Learning │ ✓ AI Lab │
│ 2024–25 – DBMS │ │
├───────────────────────────────────────────────────────┴────────────────────┤
│ [ Save Draft ] [ Reset ] [ Submit Options ] │
└────────────────────────────────────────────────────────────────────────────┘

15. DESIGN REQUIREMENT

The final Figma design must look like one section/tab of an existing college ERP or academic management system.

Do NOT create:

Separate login page
Separate dashboard
Separate faculty profile page
Separate guidelines page
Separate subject pages
Separate laboratory pages
Multiple screens for different years

Everything must belong to ONE SINGLE TAB and ONE SINGLE SCREEN.

Use collapsible/compact components, tabs, dropdowns, badges, modal/drawer interactions, and a right-side selection summary to fit all information neatly.

The most important visual priorities are:

Faculty experience
Odd/Even semester
1st/2nd/3rd/4th year
Theory/Lab
One or two subject options based on experience
Tough subject ★ indicator
Experienced faculty eligibility
Previous subjects handled
Subject selection summary
Final submission