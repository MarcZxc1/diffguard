import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId") || "";
  const invoiceId = searchParams.get("invoiceId") || "";

  // Unsafe SQL query construction - deterministic rule should catch this
  const query = `SELECT * FROM "Invoice" WHERE id = '${invoiceId}'`;
  const invoices = await prisma.$queryRawUnsafe(`SELECT * FROM "Invoice" WHERE accountId = '${accountId}'`);

  return NextResponse.json({ query, invoices });
}
