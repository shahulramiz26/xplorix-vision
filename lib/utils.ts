import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUsername(companyId: string, role: string, index: number): string {
  const prefix = role === 'SUPERVISOR' ? 'SUP' : 'OPR'
  const paddedIndex = String(index).padStart(2, '0')
  return `RIG01_${prefix}${paddedIndex}`
}

export function generatePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let password = ''
  // Ensure at least 1 uppercase, 1 number
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
  password += '0123456789'[Math.floor(Math.random() * 10)]
  
  for (let i = 0; i < 10; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  
  return password
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function calculateTrialDays(endDate: Date): number {
  const now = new Date()
  const diff = endDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
