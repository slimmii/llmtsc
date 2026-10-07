export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
}

export function fullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
