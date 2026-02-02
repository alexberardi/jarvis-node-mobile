import ExpoModulesCore
import CryptoKit
import Foundation

public class JarvisCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JarvisCrypto")

    AsyncFunction("argon2id") { (password: String, saltB64: String, params: [String: Int], promise: Promise) in
      guard let salt = Data(base64URLEncoded: saltB64) else {
        promise.reject("INVALID_SALT", "Salt must be valid base64url")
        return
      }

      guard let m = params["m"], let t = params["t"], let p = params["p"] else {
        promise.reject("INVALID_PARAMS", "Params must include m, t, p")
        return
      }

      do {
        let key = try Argon2.hash(
          password: password,
          salt: salt,
          memory: UInt32(m),
          iterations: UInt32(t),
          parallelism: UInt32(p),
          hashLength: 32
        )
        promise.resolve(key.base64URLEncodedString())
      } catch {
        promise.reject("ARGON2_ERROR", error.localizedDescription)
      }
    }

    AsyncFunction("aesGcmEncrypt") { (keyB64: String, ivB64: String, plaintextB64: String, aad: String, promise: Promise) in
      guard let keyData = Data(base64URLEncoded: keyB64), keyData.count == 32 else {
        promise.reject("INVALID_KEY", "Key must be 32 bytes base64url")
        return
      }
      guard let iv = Data(base64URLEncoded: ivB64), iv.count == 12 else {
        promise.reject("INVALID_IV", "IV must be 12 bytes base64url")
        return
      }
      guard let plaintext = Data(base64URLEncoded: plaintextB64) else {
        promise.reject("INVALID_PLAINTEXT", "Plaintext must be valid base64url")
        return
      }
      guard let aadData = aad.data(using: .utf8) else {
        promise.reject("INVALID_AAD", "AAD must be valid UTF-8")
        return
      }

      do {
        let key = SymmetricKey(data: keyData)
        let nonce = try AES.GCM.Nonce(data: iv)
        let sealed = try AES.GCM.seal(plaintext, using: key, nonce: nonce, authenticating: aadData)

        let result: [String: String] = [
          "ciphertext": sealed.ciphertext.base64URLEncodedString(),
          "tag": sealed.tag.base64URLEncodedString()
        ]
        promise.resolve(result)
      } catch {
        promise.reject("ENCRYPT_ERROR", error.localizedDescription)
      }
    }

    AsyncFunction("aesGcmDecrypt") { (keyB64: String, ivB64: String, ciphertextB64: String, tagB64: String, aad: String, promise: Promise) in
      guard let keyData = Data(base64URLEncoded: keyB64), keyData.count == 32 else {
        promise.reject("INVALID_KEY", "Key must be 32 bytes base64url")
        return
      }
      guard let iv = Data(base64URLEncoded: ivB64), iv.count == 12 else {
        promise.reject("INVALID_IV", "IV must be 12 bytes base64url")
        return
      }
      guard let ciphertext = Data(base64URLEncoded: ciphertextB64) else {
        promise.reject("INVALID_CIPHERTEXT", "Ciphertext must be valid base64url")
        return
      }
      guard let tag = Data(base64URLEncoded: tagB64), tag.count == 16 else {
        promise.reject("INVALID_TAG", "Tag must be 16 bytes base64url")
        return
      }
      guard let aadData = aad.data(using: .utf8) else {
        promise.reject("INVALID_AAD", "AAD must be valid UTF-8")
        return
      }

      do {
        let key = SymmetricKey(data: keyData)
        let nonce = try AES.GCM.Nonce(data: iv)
        let sealed = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag)
        let plaintext = try AES.GCM.open(sealed, using: key, authenticating: aadData)
        promise.resolve(plaintext.base64URLEncodedString())
      } catch {
        promise.reject("DECRYPT_ERROR", "Authentication failed")
      }
    }

    AsyncFunction("randomBytes") { (length: Int, promise: Promise) in
      var bytes = [UInt8](repeating: 0, count: length)
      let status = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
      if status == errSecSuccess {
        promise.resolve(Data(bytes).base64URLEncodedString())
      } else {
        promise.reject("RANDOM_ERROR", "Failed to generate random bytes")
      }
    }
  }
}

// MARK: - Base64URL Extensions

extension Data {
  init?(base64URLEncoded string: String) {
    var base64 = string
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")

    let paddingLength = (4 - base64.count % 4) % 4
    base64 += String(repeating: "=", count: paddingLength)

    self.init(base64Encoded: base64)
  }

  func base64URLEncodedString() -> String {
    return self.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

// MARK: - Argon2 Implementation

enum Argon2Error: Error {
  case invalidInput
  case hashingFailed
}

class Argon2 {
  static func hash(
    password: String,
    salt: Data,
    memory: UInt32,
    iterations: UInt32,
    parallelism: UInt32,
    hashLength: Int
  ) throws -> Data {
    guard let passwordData = password.data(using: .utf8) else {
      throw Argon2Error.invalidInput
    }

    var hash = [UInt8](repeating: 0, count: hashLength)

    let result = passwordData.withUnsafeBytes { passwordBytes in
      salt.withUnsafeBytes { saltBytes in
        argon2id_hash_raw(
          iterations,
          memory,
          parallelism,
          passwordBytes.baseAddress,
          passwordData.count,
          saltBytes.baseAddress,
          salt.count,
          &hash,
          hashLength
        )
      }
    }

    guard result == 0 else {
      throw Argon2Error.hashingFailed
    }

    return Data(hash)
  }
}
