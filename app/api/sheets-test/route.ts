import { NextResponse } from "next/server";
import { getGoogleSheets } from "@/lib/googleSheets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sheets = await getGoogleSheets();

    const result = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      fields: "properties.title,sheets.properties.title",
    });

    return NextResponse.json({
      success: true,
      spreadsheet: result.data.properties?.title,
      tabs: result.data.sheets?.map(
        (sheet) => sheet.properties?.title
      ),
    });
  } catch (error) {
    console.error("Google Sheets connection failed:", error);

    return NextResponse.json(
      { success: false, message: "Connection failed. Check server logs." },
      { status: 500 }
    );
  }
}
