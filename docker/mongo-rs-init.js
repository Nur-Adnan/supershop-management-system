// Initialize a single-node replica set so MongoDB multi-document transactions work.
// The member host is localhost:27017 so the API (running on the host, not in a
// container) can connect via mongodb://localhost:27017/...?replicaSet=rs0.
try {
  rs.status();
  print("Replica set already initialized.");
} catch (err) {
  print("Initiating replica set rs0...");
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
  print("Replica set initiated.");
}
