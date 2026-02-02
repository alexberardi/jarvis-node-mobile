require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'JarvisCrypto'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '13.4'
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,c}"
  s.exclude_files = "Argon2/**/*.{h,c}"

  s.subspec 'Argon2' do |argon2|
    argon2.source_files = "Argon2/**/*.{h,c}"
    argon2.public_header_files = "Argon2/include/*.h"
    argon2.compiler_flags = '-DARGON2_NO_THREADS'
  end

  s.pod_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => '$(PODS_TARGET_SRCROOT)/Argon2/include',
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/Argon2/include'
  }
end
