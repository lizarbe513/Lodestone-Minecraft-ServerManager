/// Módulo de diagnóstico inteligente de errores de la JVM y servidores Java de Minecraft.

pub fn diagnose_java_log(text: &str) -> Option<String> {
    if text.contains("UnsupportedClassVersionError") || text.contains("has been compiled by a more recent version of the Java Runtime") {
        return Some(
            "⚠️ DIAGNÓSTICO: Incompatibilidad de versión de Java. "
            .to_string() +
            "Esta versión de Minecraft requiere una versión más reciente de Java (ejemplo: Java 17 para MC 1.18 - 1.20.4, o Java 21 para MC 1.20.5+). " +
            "Selecciona otra versión de Java en la pestaña 'Servidor'."
        );
    }

    if text.contains("java.lang.OutOfMemoryError") || text.contains("Could not reserve enough space") {
        return Some(
            "⚠️ DIAGNÓSTICO: Memoria RAM insuficiente. "
            .to_string() +
            "El servidor se quedó sin memoria o la asignación (-Xmx) supera la capacidad del sistema. " +
            "Ajusta la cantidad de RAM en la pestaña 'Servidor'."
        );
    }

    if text.contains("FAILED TO BIND TO PORT") || text.contains("Address already in use") || text.contains("Can't bind to port") {
        return Some(
            "⚠️ DIAGNÓSTICO: Conflicto de puertos de red. "
            .to_string() +
            "El puerto del servidor (por defecto 25565) ya está siendo usado por otro proceso. " +
            "Cambia la opción 'server-port' en la pestaña 'Propiedades'."
        );
    }

    if text.contains("A JNI error has occurred") || text.contains("java.lang.NoClassDefFoundError") {
        return Some(
            "⚠️ DIAGNÓSTICO: Error de clases o librerías faltantes. "
            .to_string() +
            "Falta una dependencia o hay un Mod/Plugin incompatible con la versión actual de Minecraft."
        );
    }

    if text.contains("Invalid maximum heap size") || text.contains("Unrecognized option:") {
        return Some(
            "⚠️ DIAGNÓSTICO: Parámetro JVM inválido. "
            .to_string() +
            "El valor asignado a la memoria RAM no es soportado por el ejecutable de Java."
        );
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnose_java_version_error() {
        let log = "java.lang.UnsupportedClassVersionError: net/minecraft/server/Main has been compiled by a more recent version of the Java Runtime";
        let diag = diagnose_java_log(log);
        assert!(diag.is_some());
        assert!(diag.unwrap().contains("Incompatibilidad de versión de Java"));
    }

    #[test]
    fn test_diagnose_out_of_memory() {
        let log = "java.lang.OutOfMemoryError: Java heap space";
        let diag = diagnose_java_log(log);
        assert!(diag.is_some());
        assert!(diag.unwrap().contains("Memoria RAM insuficiente"));
    }

    #[test]
    fn test_diagnose_port_in_use() {
        let log = "**** FAILED TO BIND TO PORT! ****";
        let diag = diagnose_java_log(log);
        assert!(diag.is_some());
        assert!(diag.unwrap().contains("Conflicto de puertos de red"));
    }
}
