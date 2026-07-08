Directorio del **Backend** de Rust:  `src-tauri/src/
Archivo principal para **correr** el código Rust:`src-tauri/src/lib.rs`
Como crear **Funciones**:
**Rust**
```rust
//src-tauri/src/lib.rs
#[tauri::command]
fn my_custom_command() {
  println!("I was invoked from JavaScript!");
}
```
Agregar la lista de **comandos** nuevos a la función constructora:
**Rust**
```rust
//src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
+    .invoke_handler(tauri::generate_handler![my_custom_command])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```
**Invocar** el comando/función en el código JavaScript:
**JavaScript**
```javascript
//src/main.js
// When using the Tauri API npm package:
import { invoke } from '@tauri-apps/api/core';

// When using the Tauri global script (if not using the npm package)
// Be sure to set `app.withGlobalTauri` in `tauri.conf.json` to true
const invoke = window.__TAURI__.core.invoke;

// Invoke the command
+ invoke('my_custom_command');
```
**Otros Archivos**
Definir comandos en **archivos** separados del principal.
Todo archivo debe de estar dentro del **directorio** `src-tauri/src/`
**Importamos** los comandos del otro archivo dentro de la función constructora:
**Rust**
```rust
//src-tauri/src/main.rs
+ mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
+   .invoke_handler(tauri::generate_handler![commands::my_custom_command])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```
**Pasar Argumentos**
Las funciones pueden recibir **argumentos**:
**Rust**
```rust
//src-tauri/src
#[tauri::command]
fn my_custom_command(invoke_message: String) {
  println!("I was invoked from JavaScript, with this message: {}", invoke_message);
}
```
Los argumentos se **pasan** desde el código JavaScript:
**JavaScript**
```javascript
invoke('my_custom_command', { invokeMessage: 'Hello!' });
```
**Retornar Datos**
Los comandos de Rust pueden **retornar** Datos al Frontend:
**Rust**
```rust
//src-tauri/src/
#[tauri::command]
fn my_custom_command() -> String {
  "Hello from Rust!".into()
}
```
Y este retorno se puede **mostrar** en la consola de la Web:
**JavaScript**
```javascript
invoke('my_custom_command').then((message) => console.log(message));
```
