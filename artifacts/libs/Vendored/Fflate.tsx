class Fflate extends Lib {
	icon = "/AnuraOS/assets/icons/generic.svg";
	package = "npm:fflate";
	name = "fflate";

	src = "/AnuraOS/libs/fflate/browser.js";

	versions: { [key: string]: any } = {};
	latestVersion = "0.0.0";

	async getImport(version?: string): Promise<any> {
		if (this.latestVersion === "0.0.0") {
			this.latestVersion = await (
				await fetch("/AnuraOS/libs/fflate/version")
			).json();
			this.versions[this.latestVersion] = await import(this.src);
		}
		if (!version) {
			version = this.latestVersion;
		}

		if (!this.versions[version]) {
			throw new Error("Version not found");
		}
		return this.versions[version];
	}
}
