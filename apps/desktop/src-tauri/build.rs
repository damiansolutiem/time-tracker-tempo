fn main() {
    println!("cargo:rerun-if-env-changed=TEMPO_BUILD_FLAVOR");
    tauri_build::build()
}
