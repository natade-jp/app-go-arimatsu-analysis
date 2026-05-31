import sharp from "sharp";
import path from "path";

async function main() {
	const imagePaths = process.argv.slice(2);
	if (imagePaths.length === 0) {
		console.error("使い方: node src/inspectImage.js data/images/page-1.png");
		process.exit(1);
	}

	for (const imagePath of imagePaths) {
		try {
			const image = sharp(imagePath);
			const metadata = await image.metadata();
			console.log(`画像: ${path.basename(imagePath)}`);
			console.log(`  フォーマット: ${metadata.format}`);
			console.log(`  幅: ${metadata.width}`);
			console.log(`  高さ: ${metadata.height}`);
			if (metadata.density) {
				console.log(`  解像度 (density): ${metadata.density}`);
			}
			console.log("");
		} catch (error) {
			console.error(`画像の読み込みに失敗しました: ${imagePath}`);
			console.error(error.message);
		}
	}

	console.log("画像サイズを確認し、src/tableConfig.js の tableRect と field.y を調整してください。");
}

main();
