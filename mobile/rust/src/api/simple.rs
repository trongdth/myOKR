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

#[flutter_rust_bridge::frb(sync)]
pub fn merge_automerge_binaries(local_binary: Vec<u8>, remote_binary: Vec<u8>) -> Vec<u8> {
    use automerge::AutoCommit;
    let mut local_doc = AutoCommit::load(&local_binary).unwrap();
    let mut remote_doc = AutoCommit::load(&remote_binary).unwrap();
    local_doc.merge(&mut remote_doc).unwrap();
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
        AutoCommit::load(&binary).unwrap()
    };

    let val: Value = serde_json::from_str(&json_str).unwrap();
    
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
