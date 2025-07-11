import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { users, type User } from '@/db/schema'
import { db } from '@/lib/db';

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    return user[0] || null;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}

export async function verifyCredentials(
  email: string, 
  password: string
): Promise<User | null> {
  try {
    const user = await getUserByEmail(email);
    
    if (!user) {
      return null;
    }

    if (!user.password) {
      throw new Error('no_password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error verifying credentials:', error);
    throw error;
  }
}

export async function createUser(
  email: string, 
  password: string, 
  name?: string
): Promise<User> {
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  
  const newUser = await db
    .insert(users)
    .values({
      email,
      password: hashedPassword,
      name,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();
  
  return newUser[0];
}