#[flutter_rust_bridge::frb(sync)] // Synchronous mode for simplicity of the demo
pub fn greet(name: String) -> String {
    format!("Hello, {name}!")
}

#[flutter_rust_bridge::frb(sync)]
pub fn test_automerge_doc(key: String, value: String) -> String {
    use automerge::transaction::Transactable;
    use automerge::{AutoCommit, ReadDoc, ROOT};
    
    let mut doc = AutoCommit::new();
    doc.put(ROOT, &key, value).unwrap();
    let (return_val, _) = doc.get(ROOT, &key).unwrap().unwrap();
    return_val.into_string().unwrap()
}

#[flutter_rust_bridge::frb(init)]
pub fn init_app() {
    // Default utilities - feel free to customize
    flutter_rust_bridge::setup_default_user_utils();
}

/// Loads an Automerge document, falling back to a fresh doc when the binary
/// is corrupt/truncated. Recovery is surfaced loudly (desktop's rule: "never
/// silent") — the caller then writes the fresh doc, so the corruption is
/// replaced, not silently dropped.
fn load_or_new(binary: &[u8]) -> automerge::AutoCommit {
    match automerge::AutoCommit::load(binary) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("myOKR: recovered from corrupt Automerge binary: {e:?}");
            automerge::AutoCommit::new()
        }
    }
}

#[flutter_rust_bridge::frb(sync)]
pub fn merge_automerge_binaries(local_binary: Vec<u8>, remote_binary: Vec<u8>) -> Vec<u8> {
    // A corrupt/truncated side must not panic across the FFI boundary —
    // recover what's valid (desktop's load retry ends the same way: the
    // corrupt side is dropped, the good side wins).
    let mut local_doc = load_or_new(&local_binary);
    let mut remote_doc = load_or_new(&remote_binary);
    if local_doc.merge(&mut remote_doc).is_err() {
        return local_doc.save();
    }
    local_doc.save()
}

#[flutter_rust_bridge::frb(sync)]
pub fn create_automerge_doc_with_data(key: String, value: String) -> Vec<u8> {
    use automerge::transaction::Transactable;
    use automerge::{AutoCommit, ROOT};
    let mut doc = AutoCommit::new();
    doc.put(ROOT, &key, value).unwrap();
    doc.save()
}

#[flutter_rust_bridge::frb(sync)]
pub fn automerge_update_property(binary: Vec<u8>, key: String, json_str: String) -> Vec<u8> {
    use automerge::{AutoCommit, ObjId, ObjType, ROOT};
    use automerge::transaction::Transactable;
    use serde_json::Value;

    let mut doc = if binary.is_empty() {
        AutoCommit::new()
    } else {
        // Corrupt file: fall back to a fresh doc instead of panicking
        // across FFI (mirrors desktop's last-resort init).
        load_or_new(&binary)
    };

    let val: Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        // Invalid payload: no-op — return the input unchanged rather than
        // wiping the document with an empty save.
        Err(_) => return binary,
    };
    
    fn insert_value(doc: &mut AutoCommit, obj: &ObjId, key: &automerge::Prop, val: &Value) {
        match val {
            Value::Null => { doc.put(obj, key.clone(), ()).unwrap(); }
            Value::Bool(b) => { doc.put(obj, key.clone(), *b).unwrap(); }
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    doc.put(obj, key.clone(), i).unwrap();
                } else if let Some(f) = n.as_f64() {
                    doc.put(obj, key.clone(), f).unwrap();
                }
            }
            Value::String(s) => { doc.put(obj, key.clone(), s.as_str()).unwrap(); }
            Value::Array(arr) => {
                let list_id = doc.put_object(obj, key.clone(), ObjType::List).unwrap();
                for (i, v) in arr.iter().enumerate() {
                    doc.insert(&list_id, i, ()).unwrap();
                    insert_value(doc, &list_id, &automerge::Prop::Seq(i), v);
                }
            }
            Value::Object(map) => {
                let map_id = doc.put_object(obj, key.clone(), ObjType::Map).unwrap();
                for (k, v) in map.iter() {
                    insert_value(doc, &map_id, &automerge::Prop::Map(k.clone()), v);
                }
            }
        }
    }

    insert_value(&mut doc, &ROOT, &automerge::Prop::Map(key), &val);
    doc.save()
}

#[flutter_rust_bridge::frb(sync)]
pub fn automerge_get_property(binary: Vec<u8>, key: String) -> String {
    use automerge::{AutoCommit, ReadDoc, ROOT, Value as AmValue, ObjId};
    use serde_json::{Value, Map};

    if binary.is_empty() {
        return "null".to_string();
    }

    let doc = match AutoCommit::load(&binary) {
        Ok(d) => d,
        Err(_) => return "null".to_string(),
    };

    fn read_value(doc: &AutoCommit, obj: &ObjId, prop: &automerge::Prop) -> Value {
        if let Ok(Some((val, id))) = doc.get(obj, prop.clone()) {
            match val {
                AmValue::Object(automerge::ObjType::Map) | AmValue::Object(automerge::ObjType::Table) => {
                    let mut map = Map::new();
                    for key in doc.keys(&id) {
                        map.insert(key.clone(), read_value(doc, &id, &automerge::Prop::Map(key)));
                    }
                    Value::Object(map)
                }
                AmValue::Object(automerge::ObjType::List) | AmValue::Object(automerge::ObjType::Text) => {
                    let mut arr = Vec::new();
                    for i in 0..doc.length(&id) {
                        arr.push(read_value(doc, &id, &automerge::Prop::Seq(i)));
                    }
                    Value::Array(arr)
                }
                AmValue::Scalar(s) => {
                    match s.as_ref() {
                        automerge::ScalarValue::Null => Value::Null,
                        automerge::ScalarValue::Boolean(b) => Value::Bool(*b),
                        automerge::ScalarValue::F64(f) => serde_json::Number::from_f64(*f).map(Value::Number).unwrap_or(Value::Null),
                        automerge::ScalarValue::Int(i) => Value::Number((*i).into()),
                        automerge::ScalarValue::Uint(u) => Value::Number((*u).into()),
                        automerge::ScalarValue::Str(s) => Value::String(s.to_string()),
                        automerge::ScalarValue::Bytes(b) => Value::String(String::from_utf8_lossy(b).to_string()),
                        _ => Value::Null,
                    }
                }
            }
        } else {
            Value::Null
        }
    }

    let val = read_value(&doc, &ROOT, &automerge::Prop::Map(key));
    serde_json::to_string(&val).unwrap_or_else(|_| "null".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use automerge::transaction::Transactable;
    use automerge::{AutoCommit, ReadDoc, ROOT};

    fn valid_doc_binary() -> Vec<u8> {
        create_automerge_doc_with_data("k".to_string(), "v".to_string())
    }

    fn read_key(binary: &[u8], key: &str) -> Option<String> {
        let doc = AutoCommit::load(binary).ok()?;
        let (val, _) = doc.get(ROOT, key).ok()??;
        val.into_string().ok()
    }

    #[test]
    fn merge_survives_a_corrupt_local_binary() {
        let corrupt_local = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let valid_remote = valid_doc_binary();

        let merged = merge_automerge_binaries(corrupt_local, valid_remote);
        // Must not panic; the valid side survives.
        assert_eq!(read_key(&merged, "k").as_deref(), Some("v"));
    }

    #[test]
    fn merge_survives_a_corrupt_remote_binary() {
        let valid_local = valid_doc_binary();
        let corrupt_remote = vec![0xDE, 0xAD, 0xBE, 0xEF];

        let merged = merge_automerge_binaries(valid_local, corrupt_remote);
        assert_eq!(read_key(&merged, "k").as_deref(), Some("v"));
    }

    #[test]
    fn update_survives_a_corrupt_binary() {
        let corrupt = vec![0xDE, 0xAD, 0xBE, 0xEF];

        let result = automerge_update_property(corrupt, "k".to_string(), "\"v\"".to_string());
        // Must not panic; the write lands on a fresh doc.
        assert_eq!(read_key(&result, "k").as_deref(), Some("v"));
    }

    #[test]
    fn update_returns_the_input_unchanged_on_invalid_json() {
        let valid = valid_doc_binary();

        let result =
            automerge_update_property(valid.clone(), "k".to_string(), "not json {".to_string());
        // Must not panic and must not wipe the doc: no-op save.
        assert_eq!(result, valid);
    }
}
