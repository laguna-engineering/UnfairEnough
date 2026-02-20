import { checkbox, select } from "@inquirer/prompts";
import { type ChildProcess, spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const children: ChildProcess[] = [];

function cleanup() {
	for (const child of children) {
		child.kill("SIGTERM");
	}
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

function run(command: string, args: string[], env?: Record<string, string>) {
	const child = spawn(command, args, {
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
	children.push(child);
	child.on("error", (err) => {
		console.error(`Failed to start: ${command} ${args.join(" ")}`, err);
	});
	return child;
}

function getLanAddress(): string | undefined {
	const nets = networkInterfaces();
	for (const interfaces of Object.values(nets)) {
		for (const iface of interfaces ?? []) {
			if (iface.family === "IPv4" && !iface.internal) {
				return iface.address;
			}
		}
	}
	return undefined;
}

function printLanAddress() {
	const lan = getLanAddress();
	if (lan) {
		console.log(`\n  LAN address: http://${lan}:3000\n`);
	}
}

function startServer() {
	console.log("\nStarting server...");
	run("yarn", ["dev:server"]);
	printLanAddress();
}

type Mode = "local" | "hosted" | "dev";
type TvPlatform = "android-tv" | "web";
type MobilePlatform = "android" | "web";

function startTv(tvPlatform: TvPlatform) {
	console.log(
		`Starting TV app (${tvPlatform === "web" ? "web" : "Android TV"})...`,
	);
	if (tvPlatform === "web") {
		run("yarn", ["tv", "web"], { EXPO_TV: "1" });
	} else {
		run("yarn", ["tv", "expo", "run:android"], {
			EXPO_TV: "1",
		});
	}
}

function startMobile(mobilePlatform: MobilePlatform) {
	console.log(
		`Starting mobile app (${mobilePlatform === "web" ? "web" : "Android"})...`,
	);
	if (mobilePlatform === "web") {
		run("yarn", ["mobile", "web"]);
	} else {
		run("yarn", ["mobile", "expo", "run:android"]);
	}
}

async function askMobilePlatform(
	tvIsAndroid: boolean,
): Promise<MobilePlatform> {
	if (tvIsAndroid) {
		// Two Android builds would clash over adb — default to web
		return "web";
	}
	const mobilePlatform = await select<MobilePlatform>({
		message: "Mobile platform?",
		choices: [
			{ name: "Web", value: "web" },
			{ name: "Android (dev build)", value: "android" },
		],
	});
	return mobilePlatform;
}

async function main() {
	const mode = await select<Mode>({
		message: "What do you want to do?",
		choices: [
			{
				name: "Play (Local mode — TV is the server)",
				value: "local",
			},
			{
				name: "Play (Hosted mode — Bun server)",
				value: "hosted",
			},
			{
				name: "Development (pick what to launch)",
				value: "dev",
			},
		],
	});

	if (mode === "local" || mode === "hosted") {
		const tvPlatform = await select<TvPlatform>({
			message: "TV platform?",
			choices: [
				{ name: "Web", value: "web" },
				{ name: "Android TV", value: "android-tv" },
			],
		});

		const wantsMobile = await select<boolean>({
			message: "Also start mobile dev server (for testing on phone/browser)?",
			choices: [
				{ name: "Yes", value: true },
				{ name: "No", value: false },
			],
		});

		let mobilePlatform: MobilePlatform | null = null;
		if (wantsMobile) {
			mobilePlatform = await askMobilePlatform(tvPlatform === "android-tv");
		}

		if (mode === "hosted") {
			startServer();
		}

		startTv(tvPlatform);

		if (mobilePlatform) {
			startMobile(mobilePlatform);
		}
	} else {
		const services = await checkbox<string>({
			message: "What to start?",
			choices: [
				{ name: "Server", value: "server" },
				{ name: "TV app", value: "tv" },
				{ name: "Mobile app", value: "mobile" },
			],
		});

		if (services.length === 0) {
			console.log("Nothing selected, exiting.");
			process.exit(0);
		}

		if (services.includes("server")) {
			startServer();
		}

		const hasTv = services.includes("tv");
		const hasMobile = services.includes("mobile");

		let tvPlatform: TvPlatform | null = null;
		if (hasTv) {
			tvPlatform = await select<TvPlatform>({
				message: "TV platform?",
				choices: [
					{ name: "Web", value: "web" },
					{ name: "Android TV", value: "android-tv" },
				],
			});
		}

		let mobilePlatform: MobilePlatform | null = null;
		if (hasMobile) {
			mobilePlatform = await askMobilePlatform(
				hasTv && tvPlatform === "android-tv",
			);
		}

		if (tvPlatform) {
			startTv(tvPlatform);
		}

		if (mobilePlatform) {
			startMobile(mobilePlatform);
		}
	}

	// Keep the process alive while children are running
	await new Promise(() => {});
}

main().catch((err) => {
	// User cancelled with Ctrl+C during prompt
	if (err.name === "ExitPromptError") {
		process.exit(0);
	}
	console.error(err);
	process.exit(1);
});
