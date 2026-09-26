import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { recoverStaleReviewRuns, processNextReviewRun } from "@/services/review-worker";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    await recoverStaleReviewRuns();
    
    let processed = 0;
    for (let i = 0; i < 5; i++) {
      const run = await processNextReviewRun();
      if (!run) break;
      processed++;
    }

    return NextResponse.json({ status: "ok", processed });
  } catch (error: any) {
    console.error("Cron review worker failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
