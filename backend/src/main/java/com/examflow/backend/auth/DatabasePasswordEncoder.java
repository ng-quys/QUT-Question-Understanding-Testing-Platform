package com.examflow.backend.auth;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Supports imported standard PHC Argon2 hashes and existing BCrypt hashes. */
public class DatabasePasswordEncoder implements PasswordEncoder {
    private final BCryptPasswordEncoder bcrypt=new BCryptPasswordEncoder(12);
    private final Argon2PasswordEncoder argon2=Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    public String encode(CharSequence raw){return argon2.encode(raw);}
    public boolean matches(CharSequence raw,String encoded){
        if(raw==null||encoded==null)return false;
        try {
            if(encoded.startsWith("$argon2"))return argon2.matches(raw,encoded);
            if(encoded.startsWith("{bcrypt}"))encoded=encoded.substring(8);
            return encoded.startsWith("$2")&&bcrypt.matches(raw,encoded);
        }catch(IllegalArgumentException invalid){return false;}
    }
    public boolean upgradeEncoding(String encoded){return encoded==null||!encoded.startsWith("$argon2")||argon2.upgradeEncoding(encoded);}
}
