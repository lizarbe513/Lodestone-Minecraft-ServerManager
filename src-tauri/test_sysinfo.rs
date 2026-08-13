use sysinfo::System;
fn main() {
    let mut sys = System::new_all();
    sys.refresh_all();
    let p = sys.processes().values().next().unwrap();
    println!("Mem: {}", p.memory());
}
