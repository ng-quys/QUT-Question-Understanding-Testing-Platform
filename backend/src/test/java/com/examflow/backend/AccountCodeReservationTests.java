package com.examflow.backend;

import com.examflow.backend.dto.RegistrationRole;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AccountCodeReservation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AccountCodeReservationTests {
    @Test void keepsTheExactCodeForTheIssuingAdminAndRole() {
        var reservations=new AccountCodeReservation();
        String token=reservations.issue(7L,RegistrationRole.STUDENT,"2001230123");
        assertEquals("2001230123",reservations.verify(7L,RegistrationRole.STUDENT,token));
        assertThrows(ApiException.class,()->reservations.verify(8L,RegistrationRole.STUDENT,token));
        assertThrows(ApiException.class,()->reservations.verify(7L,RegistrationRole.TEACHER,token));
    }

    @Test void rejectsTamperingAndReservationsFromAnOldServerInstance() {
        var reservations=new AccountCodeReservation();
        String token=reservations.issue(7L,RegistrationRole.TEACHER,"3001240123");
        assertEquals("3001240123",reservations.verify(7L,RegistrationRole.TEACHER,token));
        assertThrows(ApiException.class,()->reservations.verify(7L,RegistrationRole.TEACHER,"x"+token));
        assertThrows(ApiException.class,()->new AccountCodeReservation().verify(7L,RegistrationRole.TEACHER,token));
        assertThrows(ApiException.class,()->reservations.verify(7L,RegistrationRole.TEACHER,
                reservations.issue(7L,RegistrationRole.TEACHER,"2001230123")));
    }
}
