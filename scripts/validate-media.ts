/**
 * Validates that all media referenced in question YAML files
 * exists on disk and is actually a valid image (not HTML, text, etc.).
 *
 * Usage: bun scripts/validate-media.ts [--fix]
 *   --fix  Delete corrupt (non-image) files so they can be re-downloaded
 */
import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { parse } from "yaml";

const QUESTIONS_DIR = resolve(import.meta.dir, "../questions");
const FIX_MODE = process.argv.includes("--fix");

type Severity = "error" | "warning";

interface Issue {
	severity: Severity;
	file: string;
	questionId: string;
	mediaUrl: string;
	problem: string;
}

function getFileType(filePath: string): string {
	try {
		return execSync(`file --brief "${filePath}"`, { encoding: "utf-8" }).trim();
	} catch {
		return "unknown";
	}
}

/** Maps file(1) output patterns to the actual image format */
const IMAGE_FORMAT_PATTERNS: Array<{ pattern: RegExp; format: string }> = [
	{ pattern: /JPEG/i, format: "jpeg" },
	{ pattern: /PNG/i, format: "png" },
	{ pattern: /GIF/i, format: "gif" },
	{ pattern: /Web\/P/i, format: "webp" },
	{ pattern: /bitmap/i, format: "bmp" },
];

/** Extension to expected format mapping */
const EXT_TO_FORMAT: Record<string, string> = {
	".jpg": "jpeg",
	".jpeg": "jpeg",
	".png": "png",
	".gif": "gif",
	".webp": "webp",
	".bmp": "bmp",
};

function classifyImage(filePath: string): {
	isImage: boolean;
	actualFormat: string | null;
	detail: string;
} {
	const detail = getFileType(filePath);

	for (const { pattern, format } of IMAGE_FORMAT_PATTERNS) {
		if (pattern.test(detail)) {
			return { isImage: true, actualFormat: format, detail };
		}
	}

	return { isImage: false, actualFormat: null, detail };
}

function validateYamlFile(yamlPath: string): Issue[] {
	const issues: Issue[] = [];
	const fileName = basename(yamlPath);

	let raw: unknown;
	try {
		const content = readFileSync(yamlPath, "utf-8");
		raw = parse(content);
	} catch (err) {
		issues.push({
			severity: "error",
			file: fileName,
			questionId: "-",
			mediaUrl: "-",
			problem: `Failed to parse YAML: ${err}`,
		});
		return issues;
	}

	if (!raw || typeof raw !== "object") return issues;
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.questions)) return issues;

	for (let i = 0; i < obj.questions.length; i++) {
		const q = obj.questions[i] as Record<string, unknown> | undefined;
		if (!q?.media || typeof q.media !== "object") continue;

		const media = q.media as Record<string, unknown>;
		const url = media.url as string | undefined;
		const id = (q.id as string) ?? `[index ${i}]`;

		if (!url || typeof url !== "string") continue;

		// Skip external URLs — those can't be validated offline
		if (url.startsWith("http://") || url.startsWith("https://")) continue;

		const fullPath = join(QUESTIONS_DIR, url);

		// Check file exists
		try {
			statSync(fullPath);
		} catch {
			issues.push({
				severity: "error",
				file: fileName,
				questionId: id,
				mediaUrl: url,
				problem: "File not found",
			});
			continue;
		}

		// Check file is not empty
		const stat = statSync(fullPath, { throwIfNoEntry: false });
		if (stat && stat.size === 0) {
			issues.push({
				severity: "error",
				file: fileName,
				questionId: id,
				mediaUrl: url,
				problem: "File is empty (0 bytes)",
			});
			continue;
		}

		// Check file is actually an image
		if (media.type === "image") {
			const { isImage, actualFormat, detail } = classifyImage(fullPath);

			if (!isImage) {
				issues.push({
					severity: "error",
					file: fileName,
					questionId: id,
					mediaUrl: url,
					problem: `Not an image — detected as: ${detail}`,
				});

				if (FIX_MODE) {
					unlinkSync(fullPath);
					console.log(`  deleted: ${url}`);
				}
				continue;
			}

			// Warn on extension mismatch (e.g. WebP content in a .jpg file)
			const ext = extname(url).toLowerCase();
			const expectedFormat = EXT_TO_FORMAT[ext];
			if (expectedFormat && actualFormat && expectedFormat !== actualFormat) {
				issues.push({
					severity: "warning",
					file: fileName,
					questionId: id,
					mediaUrl: url,
					problem: `Extension is ${ext} but content is ${actualFormat}`,
				});
			}
		}
	}

	return issues;
}

// ── Main ──────────────────────────────────────────────

const yamlFiles = readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith(".yml"));
let errorCount = 0;
let warningCount = 0;
let totalChecked = 0;

for (const file of yamlFiles) {
	const issues = validateYamlFile(join(QUESTIONS_DIR, file));
	totalChecked++;
	if (issues.length === 0) continue;

	const errors = issues.filter((i) => i.severity === "error");
	const warnings = issues.filter((i) => i.severity === "warning");

	if (errors.length > 0) {
		console.log(`\nERROR  ${file}`);
		for (const issue of errors) {
			console.log(`  ${issue.questionId}: ${issue.problem}`);
			console.log(`    -> ${issue.mediaUrl}`);
		}
		errorCount += errors.length;
	}

	if (warnings.length > 0) {
		console.log(`\nWARN   ${file}`);
		for (const issue of warnings) {
			console.log(`  ${issue.questionId}: ${issue.problem}`);
			console.log(`    -> ${issue.mediaUrl}`);
		}
		warningCount += warnings.length;
	}
}

const status = errorCount > 0 ? "FAIL" : warningCount > 0 ? "WARN" : "OK";
console.log(
	`\n${status}  ${totalChecked} sets checked — ${errorCount} error(s), ${warningCount} warning(s)`,
);
if (errorCount > 0 && !FIX_MODE) {
	console.log("  Run with --fix to delete corrupt files so they can be re-downloaded");
}

process.exit(errorCount > 0 ? 1 : 0);
