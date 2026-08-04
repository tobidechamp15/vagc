"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { logActivity } from "@/lib/activity";

async function requireAdmin() {
  const session = await requireApprovedSession();
  if (!session || session.role !== "admin") {
    throw new Error("Not authorized");
  }
  return session;
}

async function updateUserStatus(
  userId: string,
  status: "approved" | "rejected",
  action: "ACCOUNT_APPROVE" | "ACCOUNT_REJECT",
) {
  const actor = await requireAdmin();
  await connectDB();
  const target = await User.findByIdAndUpdate(
    userId,
    { $set: { status } },
    { new: true },
  );
  if (!target) throw new Error("User not found");
  await logActivity({
    actor,
    action,
    targetId: target._id.toString(),
    targetName: target.fullName || target.email,
  });
  revalidatePath("/dashboard/users");
}

export async function approveAccount(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  await updateUserStatus(userId, "approved", "ACCOUNT_APPROVE");
}

export async function rejectAccount(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  await updateUserStatus(userId, "rejected", "ACCOUNT_REJECT");
}
