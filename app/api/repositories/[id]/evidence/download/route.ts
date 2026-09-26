import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { evidenceExportService } from "@/services/evidence-export.service";
import { canManageRepository } from "@/services/repository-authorization.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");

  try {
    const body = await request.json();
    const exported = await evidenceExportService.download(id, body, user);
    if (!exported) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    
    return new NextResponse(exported.markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${exported.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 400 });
  }
}
