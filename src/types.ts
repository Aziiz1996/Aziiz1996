export type Page = 'profile' | 'logistics' | 'updates' | 'owner' | 'university' | 'opportunities' | 'groups' | 'practice' | 'exams' | 'assistant' | 'dashboard' | 'courses' | 'plan' | 'tasks' | 'notes' | 'finance' | 'settings';
export type TaskKind = 'assignment' | 'project' | 'exam';
export type Priority = 'low' | 'medium' | 'high';
export interface ImportedQuiz { id:string; title:string; questions:Array<{id:string;question:string;options:string[];correct:number}>; }
export interface CourseResource { id: string; title: string; url: string; kind: string; section: string; }
export interface Course { id: string; name: string; color: string; code?: string; resources?: CourseResource[]; }
export interface Lecture { id: string; courseId: string; day: number; start: string; end: string; location: string; attendanceUrl?: string; fileUrl?: string; timePending?: string; }
export interface Task { id: string; title: string; courseId: string; kind: TaskKind; due: string; priority: Priority; minutes: number; completed: boolean; time?: string; endTime?: string; timePending?: string; }
export interface Note { id: string; title: string; courseId: string; content: string; summary: string; updatedAt: string; }
export interface Transaction { id: string; title: string; kind: 'expense' | 'income'; amount: number; category: string; date: string; ruleId?: string; }
export interface IncomeRule { id: string; title: string; amount: number; day: number | null; category: string; }
export interface Settings { name: string; currency: string; monthlyBudget: number; dailyMinutes: number; studyStart: string; studyDays: number[]; universityName?: string; universityUrl?: string; }
export interface UniversityEvent { id: string; title: string; date: string; time: string; endDate?: string; endTime?: string; kind: 'lecture' | 'assignment' | 'exam' | 'event'; description: string; url?: string; courseId?: string; }
export interface ProjectGroup { id: string; name: string; members: string[]; notes: string; }
export interface Attachment { name: string; mime: string; dataUrl: string; size: number; updatedAt: string; }
export interface StudentProfile { fullName: string; email: string; phone: string; city: string; headline: string; summary: string; university: string; major: string; graduationYear: string; education: string; experience: string; skills: string[]; linkedin: string; website: string; photo?: Attachment; cv?: Attachment; }
export interface OpportunityLink { id: string; name: string; url: string; kind: 'job' | 'course'; }
export interface CareerApplication { id: string; title: string; organization: string; kind: 'job' | 'course'; url: string; status: 'saved' | 'preparing' | 'submitted' | 'accepted' | 'rejected'; createdAt: string; notes: string; }
export interface StudyRun { id: string; taskId: string; title: string; date: string; plannedMinutes: number; step: number; remainingSeconds: number; runningSince: number | null; elapsedSeconds: number; reflection: string; stepRemaining?: number[]; kind?: TaskKind; }
export interface StudyLog { id: string; taskId: string; title: string; date: string; minutes: number; score: number; reflection: string; completedAt: string; reviewDates: string[]; reviewedDates: string[]; }
export interface PracticeRun { id: string; bankId: string; questionIds: string[]; answers: Record<string, string>; currentIndex: number; startedAt: string; mode: 'practice' | 'exam'; }
export interface PracticeAttempt { id: string; bankId: string; questionIds: string[]; answers: Record<string, string>; startedAt: string; finishedAt: string; score: number; total: number; mode: 'practice' | 'exam'; }
export interface AppData { version: 1; studentProfile?: StudentProfile; opportunityLinks?: OpportunityLink[]; applications?: CareerApplication[]; activeStudy?: StudyRun | null; studyLog?: StudyLog[]; activePractice?: PracticeRun | null; practiceAttempts?: PracticeAttempt[]; quizzes?: ImportedQuiz[]; demo?: boolean; profile?: boolean; projectGroups?: ProjectGroup[]; incomeRules?: IncomeRule[]; universityEvents?: UniversityEvent[]; courses: Course[]; lectures: Lecture[]; tasks: Task[]; notes: Note[]; transactions: Transaction[]; settings: Settings; }
export interface StudySession { id: string; date: string; start: string; end: string; minutes: number; taskId: string; courseId: string; title: string; kind: TaskKind; }
export interface StudyPlan { sessions: StudySession[]; unscheduledMinutes: number; remaining: Record<string, number>; }
