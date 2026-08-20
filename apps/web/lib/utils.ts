import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui 표준 cn() 헬퍼. T3.1.1에서 실제 컴포넌트 추가 시 계속 사용한다. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
