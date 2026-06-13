// pw0d AutoFill credential provider extension.
//
// iOS calls this when the user taps a pw0d suggestion above the keyboard (or
// opens Passwords ▸ pw0d). We read the encrypted cache the app wrote into the
// shared App Group, gate access behind Face ID / Touch ID, and hand the chosen
// login back to the system as an ASPasswordCredential. The vault's master
// password and Account Key never enter this process.

import AuthenticationServices
import LocalAuthentication
import UIKit

class CredentialProviderViewController: ASCredentialProviderViewController {
  private var rows: [Pw0dCredential] = []
  private let table = UITableView(frame: .zero, style: .insetGrouped)

  // MARK: Manual picker (user opened the pw0d list themselves)

  override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
    let all = Pw0dCredentialStore.load()
    let hosts = serviceIdentifiers.compactMap { URL(string: $0.identifier)?.host ?? $0.identifier }
    let matches = all.filter { cred in hosts.contains { $0.contains(cred.domain) || cred.domain.contains($0) } }
    rows = matches.isEmpty ? all : matches
    configureTable()
  }

  private func configureTable() {
    view.backgroundColor = UIColor(red: 0.094, green: 0.098, blue: 0.110, alpha: 1) // #18191c
    table.translatesAutoresizingMaskIntoConstraints = false
    table.backgroundColor = .clear
    table.dataSource = self
    table.delegate = self
    table.register(UITableViewCell.self, forCellReuseIdentifier: "cred")
    view.addSubview(table)
    NSLayoutConstraint.activate([
      table.topAnchor.constraint(equalTo: view.topAnchor),
      table.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      table.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      table.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    navigationItem.title = "pw0d"
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .cancel, target: self, action: #selector(cancel))
  }

  @objc private func cancel() {
    extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue))
  }

  // MARK: Quick-type bar (user tapped a suggestion directly)

  override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
    // Always require a biometric check before releasing a secret, so bounce to
    // our UI (the system will then call prepareInterfaceToProvideCredential).
    extensionContext.cancelRequest(
      withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue))
  }

  override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
    authenticate { [weak self] ok in
      guard let self else { return }
      guard ok, let match = Pw0dCredentialStore.load().first(where: {
        $0.id == credentialIdentity.recordIdentifier || $0.username == credentialIdentity.user
      }) else {
        self.cancel()
        return
      }
      self.complete(with: match)
    }
  }

  // MARK: Helpers

  private func authenticate(_ completion: @escaping (Bool) -> Void) {
    let context = LAContext()
    context.localizedReason = "Unlock pw0d to fill this login"
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      DispatchQueue.main.async { completion(false) }
      return
    }
    context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Fill your saved login") { success, _ in
      DispatchQueue.main.async { completion(success) }
    }
  }

  private func complete(with cred: Pw0dCredential) {
    let passwordCredential = ASPasswordCredential(user: cred.username, password: cred.password)
    extensionContext.completeRequest(withSelectedCredential: passwordCredential)
  }
}

extension CredentialProviderViewController: UITableViewDataSource, UITableViewDelegate {
  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "cred", for: indexPath)
    let cred = rows[indexPath.row]
    var content = cell.defaultContentConfiguration()
    content.text = cred.domain
    content.secondaryText = cred.username
    content.textProperties.color = UIColor(red: 0.953, green: 0.945, blue: 0.917, alpha: 1)
    content.secondaryTextProperties.color = UIColor(red: 0.663, green: 0.667, blue: 0.690, alpha: 1)
    cell.contentConfiguration = content
    cell.backgroundColor = UIColor(red: 0.114, green: 0.118, blue: 0.133, alpha: 1)
    return cell
  }

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    let cred = rows[indexPath.row]
    authenticate { [weak self] ok in
      if ok { self?.complete(with: cred) }
    }
  }
}
