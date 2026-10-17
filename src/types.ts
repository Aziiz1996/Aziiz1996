export type Page = 'university' | 'opportunities' | 'groups' | 'practice' | 'exams' | 'assistant' | 'dashboard' | 'courses' | 'plan' | 'tasks' | 'notes' | 'finance' | 'settings';
export type TaskKind = 'assignment' | 'project' | 'exam';
export type Priority = 'low' | 'medium' | 'high';
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
export interface AppData { version: 1; demo?: boolean; profile?: boolean; projectGroups?: ProjectGroup[]; incomeRules?: IncomeRule[]; universityEvents?: UniversityEvent[]; courses: Course[]; lectures: Lecture[]; tasks: Task[]; notes: Note[]; transactions: Transaction[]; settings: Settings; }
export interface StudySession { id: string; date: string; start: string; end: string; minutes: number; taskId: string; courseId: string; title: string; kind: TaskKind; }
export interface StudyPlan { sessions: StudySession[]; unscheduledMinutes: number; remaining: Record<string, number>; }
