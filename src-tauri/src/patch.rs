pub fn is_forge_server(session: &ServerSession, server_dir: &std::path::Path) -> bool {
    let name = session.jar_file_name.to_lowercase();
    name.contains("forge")
        || name.ends_with("-installer.jar")
        || server_dir.join("run.sh").is_file()
        || server_dir.join("run.bat").is_file()
        || server_dir.join("user_jvm_args.txt").is_file()
}
